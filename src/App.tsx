import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { hasOfficerRole } from "./lib/roles";

import LoginScreen from "./screens/Login/loginScreen";
import HomeScreen from "./screens/Home/homeScreen";
import RosterScreen from "./screens/Roster/rosterScreen";
import MemberDetailScreen from "./screens/Roster/memberDetailScreen";
import Layout from "./screens/Layout/Layout";
import MyPageScreen from "./screens/MyPage/myPageScreen";
import EditProfileScreen from "./screens/MyPage/editProfileScreen";
import FormsScreen from "./screens/Forms/formsScreen";
import FormAnswerScreen from "./screens/Forms/formAnswerScreen";
import CreateFormScreen from "./screens/Forms/createFormScreen";
import FormResultsScreen from "./screens/Forms/formResultsScreen";
import BandsScreen from "./screens/Bands/bandsScreen";
import BandDetailScreen from "./screens/Bands/bandDetailScreen";
import CreateBandScreen from "./screens/Bands/createBandScreen";
import AdminScreen from "./screens/AdminDashboard/adminScreen";
import RoleApprovalsScreen from "./screens/AdminDashboard/roleApprovalsScreen";
import BandApprovalsScreen from "./screens/AdminDashboard/bandApprovalsScreen";
import DuesScreen from "./screens/AdminDashboard/duesScreen";
import UserHistoryScreen from "./screens/AdminDashboard/userHistoryScreen";
import TodoScreen from "./screens/ToDo/todoScreen";
import EquipmentScreen from "./screens/Equipment/equipmentScreen";
import EquipmentDetailScreen from "./screens/Equipment/equipmentDetailScreen";
import EquipmentManageScreen from "./screens/Equipment/equipmentManageScreen";
import EquipmentRequestsScreen from "./screens/Equipment/equipmentRequestsScreen";
import JoinFlow from "./screens/Login/joinFlow";
import ReactivateScreen from "./screens/Login/reactivateScreen";
import VerifyEmailScreen from "./screens/Login/verifyEmailScreen";
import AuthActionScreen from "./screens/Login/authActionScreen";
import IntroEditScreen from "./screens/AdminDashboard/introEditScreen";
import IntroViewScreen from "./screens/Intro/introViewScreen";
import ArchiveScreen from "./screens/Archive/archiveScreen";
import ArchiveEventDetailScreen from "./screens/Archive/eventDetailScreen";
import ArchiveEditScreen from "./screens/Archive/archiveEditScreen";
import ChatScreen from "./screens/Chat/chatScreen";
import BoardScreen from "./screens/Board/boardScreen";
import CreatePostScreen from "./screens/Board/createPostScreen";
import PostDetailScreen from "./screens/Board/postDetailScreen";
import PendingHomeScreen from "./screens/Home/pendingHomeScreen";
import MemberApprovalsScreen from "./screens/AdminDashboard/memberApprovalsScreen";
import LiveListScreen from "./screens/Live/liveListScreen";
import LiveEditScreen from "./screens/Live/liveEditScreen";
import LiveDetailScreen from "./screens/Live/liveDetailScreen";
import LiveApplyScreen from "./screens/Live/liveApplyScreen";
import LiveLineupScreen from "./screens/Live/liveLineupScreen";
import SetlistScreen from "./screens/Live/setlistScreen";
import StagePlanScreen from "./screens/Live/stagePlanScreen";
import LiveSubmitDoneScreen from "./screens/Live/liveSubmitDoneScreen";
import LiveStatusScreen from "./screens/Live/liveStatusScreen";
import LiveDocumentsScreen from "./screens/Live/liveDocumentsScreen";
import { isPendingApproval } from "./lib/memberCategory";
import ErrorBoundary from "./screens/Layout/ErrorBoundary";


// 認証状態に応じて表示を切り替える中身
function AppContent() {
  const { firebaseUser, member, loading, withdrawnMember, emailVerified } = useAuth();
  const location = useLocation();

  // メールのリンクを開いたとき(確認メール・パスワード再設定など)。
  // ログインしていてもいなくても、認証状態の確認を待たずに開く
  if (location.pathname === "/auth/action") {
    return <AuthActionScreen />;
  }

  // 認証状態を確認中
  if (loading) {
    return <div style={{ padding: 40 }}>読み込み中...</div>;
  }

  // 未ログイン → ログイン画面
  // (除籍された人は AuthContext でサインアウトされるためここに来る)
  if (!firebaseUser) {
    return (
      <Routes>
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    );
  }

  // 退会済みでログインしてきた → 復帰するか尋ねる
  if (withdrawnMember) {
    return (
      <Routes>
        <Route path="*" element={<ReactivateScreen />} />
      </Routes>
    );
  }

  // ログイン済みだがメンバーではない(見学者) → 紹介画面 → プロフィール登録
  // (完全削除された人もここに来て、新規メンバーとして登録し直すことになる)
  if (!member) {
    // メールアドレスの確認が済むまでは先に進ませない(v1.3.2)。
    // ルール側でも、確認済みの大学アドレスでなければ Member を作れない
    if (!emailVerified) {
      return (
        <Routes>
          <Route path="*" element={<VerifyEmailScreen />} />
        </Routes>
      );
    }
    return (
      <Routes>
        <Route path="*" element={<JoinFlow />} />
      </Routes>
    );
  }
  // 教員・OBで、幹部の確認待ち(v1.4.0)。
  // 確認が済むまでは確認待ちのホームとサークル紹介だけを出す
  // (名簿・チャットなどはルール側でも読めない)
  if (isPendingApproval(member)) {
    return (
      <Routes>
        <Route path="/intro" element={<IntroViewScreen />} />
        <Route path="*" element={<PendingHomeScreen />} />
      </Routes>
    );
  }

  // ログイン済み+プロフィール登録済み → 通常のアプリ
  const isOfficer = hasOfficerRole(member);

return (
    <Routes>
      {/* サークル紹介はサイドバー・下部ナビを出さない独立ページとして表示する */}
      <Route path="/intro" element={<IntroViewScreen />} />
      <Route path="*" element={<AppRoutes isOfficer={isOfficer} />} />
    </Routes>
  );
}

// 通常のアプリ画面(レイアウトの中に入るもの)
function AppRoutes({ isOfficer }: { isOfficer: boolean }) {
  const location = useLocation();
  return (
    <Layout isOfficer={isOfficer}>
      {/* 1つの画面で表示の例外が出ても、アプリ全体を止めない(v1.4.1)。
          別の画面に移ればエラーの表示は解ける */}
      <ErrorBoundary resetKey={location.pathname}>
        <Routes>
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/roster" element={<RosterScreen />} />
          <Route path="/roster/:id" element={<MemberDetailScreen isOfficer={isOfficer} />} />
          <Route path="/mypage" element={<MyPageScreen />} />
          <Route path="/mypage/edit" element={<EditProfileScreen />} />
          <Route path="/forms" element={<FormsScreen isOfficer={isOfficer} />} />
          <Route path="/forms/new" element={<CreateFormScreen />} />
          <Route path="/forms/:id" element={<FormAnswerScreen />} />
          <Route path="/forms/:id/results" element={<FormResultsScreen />} />
          <Route path="/bands" element={<BandsScreen />} />
          <Route path="/bands/new" element={<CreateBandScreen />} />
          <Route path="/bands/:id" element={<BandDetailScreen />} />
          {/* アーカイブ。/new と /:id/edit は幹部だけが導線を持つが、
              権限そのものは Firestore ルール側で担保している */}
          <Route path="/archive" element={<ArchiveScreen />} />
          <Route path="/archive/new" element={<ArchiveEditScreen />} />
          <Route path="/archive/:id" element={<ArchiveEventDetailScreen />} />
          <Route path="/archive/:id/edit" element={<ArchiveEditScreen />} />
          {/* ライブ準備(v1.4.0)。作成・編集・順番・提出状況は幹部のみ
              (画面でも確かめているが、権限そのものは Firestore ルールで担保している) */}
          <Route path="/live" element={<LiveListScreen />} />
          <Route path="/live/new" element={<LiveEditScreen />} />
          <Route path="/live/:id" element={<LiveDetailScreen />} />
          <Route path="/live/:id/edit" element={<LiveEditScreen />} />
          <Route path="/live/:id/apply" element={<LiveApplyScreen />} />
          <Route path="/live/:id/lineup" element={<LiveLineupScreen />} />
          <Route path="/live/:id/setlist/:bandId" element={<SetlistScreen />} />
          <Route path="/live/:id/stage/:bandId" element={<StagePlanScreen />} />
          <Route path="/live/:id/done/:bandId" element={<LiveSubmitDoneScreen />} />
          <Route path="/live/:id/status" element={<LiveStatusScreen />} />
          <Route path="/live/:id/documents" element={<LiveDocumentsScreen />} />
          <Route path="/chat" element={<ChatScreen />} />
          <Route path="/board" element={<BoardScreen />} />
          <Route path="/board/new" element={<CreatePostScreen />} />
          <Route path="/board/:id" element={<PostDetailScreen />} />
          <Route path="/admin" element={<AdminScreen />} />
          <Route path="/admin/approvals/roles" element={<RoleApprovalsScreen />} />
          <Route path="/admin/approvals/bands" element={<BandApprovalsScreen />} />
          <Route path="/admin/approvals/members" element={<MemberApprovalsScreen />} />
          <Route path="/admin/dues" element={<DuesScreen />} />
          <Route path="/admin/history" element={<UserHistoryScreen />} />
          <Route path="/admin/intro" element={<IntroEditScreen />} />
          <Route path="/todo" element={<TodoScreen />} />
          <Route path="/equipment" element={<EquipmentScreen  />} />
          <Route path="/equipment/manage" element={<EquipmentManageScreen />} />
          <Route path="/equipment/requests" element={<EquipmentRequestsScreen />} />
          <Route path="/equipment/:id" element={<EquipmentDetailScreen />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;