import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc, updateDoc, deleteField, collection, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";
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
}

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

  // uidからmembersドキュメントを取得する。
  // 在籍中のメンバーとして読み込めた場合だけ true を返す。
  const loadMember = async (uid: string): Promise<boolean> => {
    try {
      const ref = doc(db, "members", uid);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        // 認証はしたがプロフィール未登録。完全削除された人もここに来るため、
        // 新規メンバーとしてプロフィール登録からやり直すことになる
        setMember(null);
        setWithdrawnMember(null);
        return false;
      }

      const data = { id: snapshot.id, ...(snapshot.data() as Omit<Member, "id">) };

      // 除籍: アプリに入れない。
      // 退会操作時に Worker 経由で Auth アカウントを無効化しているが、発行済みの
      // IDトークンは最大1時間有効なため、無効化の直後でもセッションが生き残る。
      // ここで弾くことでその隙間と、ログイン中に除籍された人を閉じる。
      if (data.status === "expelled") {
        setMember(null);
        setWithdrawnMember(null);
        setExpelledBlocked(true);
        await signOut(auth);
        return false;
      }

      // 退会: 本人の意思なので締め出さず、復帰するか尋ねる。
      // Member ドキュメントは残っているので、会費記録やバンド履歴も引き継がれる。
      if (data.status === "withdrawn") {
        setMember(null);
        setWithdrawnMember(data);
        return false;
      }

      setMember(data);
      setWithdrawnMember(null);
      setExpelledBlocked(false);
      return true;
    } catch (e) {
      console.error("メンバー情報の取得に失敗しました", e);
      setMember(null);
      setWithdrawnMember(null);
      return false;
    }
  };

  // 全メンバーの氏名マップを取得してキャッシュする
  const loadMemberMap = async () => {
    try {
      const snap = await getDocs(collection(db, "members"));
      const map: Record<string, MemberBrief> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as {
          name: string;
          nickname?: string;
          avatarColor?: string;
          avatarThumb?: string;
        };
        map[d.id] = {
          name: data.name,
          nickname: data.nickname,
          avatarColor: data.avatarColor,
          avatarThumb: data.avatarThumb,
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
      if (user) {
        const active = await loadMember(user.uid);
        // 在籍中でなければ氏名マップを読みに行かない(ルール上も読めない)
        if (active) {
          await loadMemberMap(); // ログイン時に氏名マップも一度だけ取得
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
    await loadMemberMap();
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
    await loadMember(withdrawnMember.id);
    await loadMemberMap();
  };

  const clearExpelledBlocked = () => {
    setExpelledBlocked(false);
  };

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
