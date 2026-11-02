import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc, updateDoc, deleteField, collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { setFormerMembersVisible } from "./members";
import { hasOfficerRole } from "./roles";
import { asText, asTextList } from "./sanitize";
import type { Member } from "../Types/types";

// 氏名解決に使う軽量なメンバー情報
export interface MemberBrief {
  name: string;
  nickname?: string;
  avatarColor?: string;
  avatarThumb?: string; // 一覧用の小さいアバター画像(原寸は images コレクション)
}

interface AuthContextValue {
  firebaseUser: User | null;   // Firebase Authのユーザー(ログインしているか)
  member: Member | null;        // その人のmembersデータ(在籍中の場合のみ入る)
  loading: boolean;             // 認証状態の確認中
  refreshMember: () => Promise<void>; // membersデータを再取得(プロフィール登録後などに使う)
  memberMap: Record<string, MemberBrief>; // 全メンバーの氏名マップ(キャッシュ)
  refreshMemberMap: () => Promise<void>;   // 氏名マップを再取得
  withdrawnMember: Member | null;  // 退会済みでログインしてきた人(復帰画面を出す)
  reactivate: () => Promise<void>; // 退会から復帰する(本人操作)
  expelledBlocked: boolean;        // 除籍済みのためログインを拒否した直後か(A-3)
  clearExpelledBlocked: () => void; // 上の表示を消す
  emailVerified: boolean;          // メールアドレスの確認が済んでいるか(v1.3.2)
  /**
   * 確認状況を取り直す。確認メールのリンクを別のタブで開いた後に使う。
   * ルールは ID トークンの email_verified を見るため、トークンも取り直す。
   * 確認済みになったら true を返す。
   */
  reloadUser: () => Promise<boolean>;
}

const NOT_ACTIVE = { active: false, officer: false } as const;

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  member: null,
  loading: true,
  refreshMember: async () => {},
  memberMap: {},
  refreshMemberMap: async () => {},
  withdrawnMember: null,
  reactivate: async () => {},
  expelledBlocked: false,
  clearExpelledBlocked: () => {},
  emailVerified: false,
  reloadUser: async () => false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [memberMap, setMemberMap] = useState<Record<string, MemberBrief>>({});
  const [loading, setLoading] = useState(true);
  const [withdrawnMember, setWithdrawnMember] = useState<Member | null>(null);
  const [expelledBlocked, setExpelledBlocked] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  // uidからmembersドキュメントを取得する。
  // 在籍中のメンバーとして読み込めた場合だけ true を返す。
  const loadMember = async (uid: string): Promise<{ active: boolean; officer: boolean }> => {
    try {
      const ref = doc(db, "members", uid);
      const snapshot = await getDoc(ref);
      setFormerMembersVisible(false);
      if (!snapshot.exists()) {
        // 認証はしたがプロフィール未登録。完全削除された人もここに来るため、
        // 新規メンバーとしてプロフィール登録からやり直すことになる
        setMember(null);
        setWithdrawnMember(null);
        return NOT_ACTIVE;
      }

      const raw = snapshot.data() as Omit<Member, "id">;
      const data: Member = {
        ...raw,
        id: snapshot.id,
        name: asText(raw.name),
        parts: asTextList(raw.parts),
        positions: asTextList(raw.positions) as Member["positions"],
      };

      // 除籍: アプリに入れない。
      // 退会操作時に Worker 経由で Auth アカウントを無効化しているが、発行済みの
      // IDトークンは最大1時間有効なため、無効化の直後でもセッションが生き残る。
      // ここで弾くことでその隙間と、ログイン中に除籍された人を閉じる。
      if (data.status === "expelled") {
        setMember(null);
        setWithdrawnMember(null);
        setExpelledBlocked(true);
        await signOut(auth);
        return NOT_ACTIVE;
      }

      // 退会: 本人の意思なので締め出さず、復帰するか尋ねる。
      // Member ドキュメントは残っているので、会費記録やバンド履歴も引き継がれる。
      if (data.status === "withdrawn") {
        setMember(null);
        setWithdrawnMember(data);
        return NOT_ACTIVE;
      }

      // ログイン用メールアドレスを変更した人(v1.4.0)。名簿に出すアドレスを合わせる。
      // 失敗してもログインは止めない(次にログインしたときにやり直される)
      const authEmail = auth.currentUser?.email ?? "";
      if (authEmail && data.email !== authEmail) {
        try {
          await updateDoc(doc(db, "members", uid), { email: authEmail });
          data.email = authEmail;
        } catch (e) {
          console.error("メールアドレスの同期に失敗しました", e);
        }
      }

      setMember(data);
      setWithdrawnMember(null);
      setExpelledBlocked(false);
      // 退会・除籍した人の記録を読めるのは幹部だけ(v1.4.1)。
      // lib/members.ts の読み方をここで切り替える
      setFormerMembersVisible(hasOfficerRole(data) && data.approved !== false);
      // 幹部の確認待ち(教員・OB)は、名簿を読めないので氏名マップを読みに行かない
      const active = data.approved !== false;
      return { active, officer: active && hasOfficerRole(data) };
    } catch (e) {
      console.error("メンバー情報の取得に失敗しました", e);
      setMember(null);
      setWithdrawnMember(null);
      return NOT_ACTIVE;
    }
  };

  // 全メンバーの氏名マップを取得してキャッシュする。
  // v1.4.1: 一般メンバーは在籍中の人だけ読める(退会・除籍した人は幹部だけ)。
  // 一般メンバーの画面では、退会した人の名前は lib/members.ts の FORMER_MEMBER_LABEL で出す
  const loadMemberMap = async (officer: boolean) => {
    try {
      const snap = await getDocs(
        officer
          ? collection(db, "members")
          : query(collection(db, "members"), where("status", "==", "active"))
      );
      const map: Record<string, MemberBrief> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as {
          name: string;
          nickname?: string;
          avatarColor?: string;
          avatarThumb?: string;
        };
        // 型が想定と違う値で画面が止まらないよう、文字列にそろえる(v1.4.1)
        map[d.id] = {
          name: asText(data.name),
          nickname: data.nickname === undefined ? undefined : asText(data.nickname),
          avatarColor: data.avatarColor === undefined ? undefined : asText(data.avatarColor),
          avatarThumb: typeof data.avatarThumb === "string" ? data.avatarThumb : undefined,
        };
      });
      setMemberMap(map);
    } catch (e) {
      console.error("メンバーマップの取得に失敗しました", e);
    }
  };

  useEffect(() => {
    // Firebaseの認証状態の変化を監視する
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setEmailVerified(user?.emailVerified ?? false);
      if (user) {
        const result = await loadMember(user.uid);
        // 在籍中でなければ氏名マップを読みに行かない(ルール上も読めない)
        if (result.active) {
          await loadMemberMap(result.officer); // ログイン時に氏名マップも一度だけ取得
        }
      } else {
        setMember(null);
        setWithdrawnMember(null);
        setMemberMap({});
        // expelledBlocked はここでは消さない。
        // signOut 直後にこの分岐へ来るため、消すとログイン画面に理由を出せなくなる。
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const refreshMember = async () => {
    if (firebaseUser) {
      await loadMember(firebaseUser.uid);
    }
  };

  const refreshMemberMap = async () => {
    await loadMemberMap(hasOfficerRole(member) && member?.approved !== false);
  };

  /**
   * 退会から復帰する(本人操作)。
   * 完全削除されていなければ Member ドキュメントが残っているので、
   * status を active に戻すだけで元の記録ごと復帰できる。
   */
  const reactivate = async () => {
    if (!withdrawnMember) return;
    await updateDoc(doc(db, "members", withdrawnMember.id), {
      status: "active",
      withdrawnAt: deleteField(),
    });
    const result = await loadMember(withdrawnMember.id);
    if (result.active) await loadMemberMap(result.officer);
  };

  const clearExpelledBlocked = () => {
    setExpelledBlocked(false);
  };

  const reloadUser = useCallback(async (): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user) return false;
    try {
      await user.reload();
      if (user.emailVerified) {
        // ルール側は ID トークンの email_verified を見るので、取り直しが要る
        await user.getIdToken(true);
      }
      setEmailVerified(user.emailVerified);
      return user.emailVerified;
    } catch (e) {
      console.error("確認状況の取得に失敗しました", e);
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        member,
        loading,
        refreshMember,
        memberMap,
        refreshMemberMap,
        withdrawnMember,
        reactivate,
        expelledBlocked,
        clearExpelledBlocked,
        emailVerified,
        reloadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
