import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { Member } from "../Types/types";

// 氏名解決に使う軽量なメンバー情報
export interface MemberBrief {
  name: string;
  nickname?: string;
  avatarColor?: string;
}

interface AuthContextValue {
  firebaseUser: User | null;   // Firebase Authのユーザー(ログインしているか)
  member: Member | null;        // その人のmembersデータ(プロフィール登録済みか)
  loading: boolean;             // 認証状態の確認中
  refreshMember: () => Promise<void>; // membersデータを再取得(プロフィール登録後などに使う)
  memberMap: Record<string, MemberBrief>; // 全メンバーの氏名マップ(キャッシュ)
  refreshMemberMap: () => Promise<void>;   // 氏名マップを再取得
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  member: null,
  loading: true,
  refreshMember: async () => {},
  memberMap: {},
  refreshMemberMap: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [memberMap, setMemberMap] = useState<Record<string, MemberBrief>>({});
  const [loading, setLoading] = useState(true);

  // uidからmembersドキュメントを取得する
  const loadMember = async (uid: string) => {
    try {
      const ref = doc(db, "members", uid);
      const snapshot = await getDoc(ref);
      if (snapshot.exists()) {
        setMember({ id: snapshot.id, ...(snapshot.data() as Omit<Member, "id">) });
      } else {
        setMember(null); // 認証はしたがプロフィール未登録
      }
    } catch (e) {
      console.error("メンバー情報の取得に失敗しました", e);
      setMember(null);
    }
  };

  // 全メンバーの氏名マップを取得してキャッシュする
  const loadMemberMap = async () => {
    try {
      const snap = await getDocs(collection(db, "members"));
      const map: Record<string, MemberBrief> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as { name: string; nickname?: string; avatarColor?: string };
        map[d.id] = {
          name: data.name,
          nickname: data.nickname,
          avatarColor: data.avatarColor,
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
        await loadMember(user.uid);
        await loadMemberMap(); // ログイン時に氏名マップも一度だけ取得
      } else {
        setMember(null);
        setMemberMap({});
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

  return (
    <AuthContext.Provider
      value={{ firebaseUser, member, loading, refreshMember, memberMap, refreshMemberMap }}
    >
      {children}
    </AuthContext.Provider>
  );
}