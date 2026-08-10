import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";

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
import ProfileSetupScreen from "./screens/Login/profileSetupScreen";
import ChatScreen from "./screens/Chat/chatScreen";
import BoardScreen from "./screens/Board/boardScreen";
import CreatePostScreen from "./screens/Board/createPostScreen";
import PostDetailScreen from "./screens/Board/postDetailScreen";


// 認証状態に応じて表示を切り替える中身
function AppContent() {
  const { firebaseUser, member, loading } = useAuth();

  // 認証状態を確認中
  if (loading) {
    return <div style={{ padding: 40 }}>読み込み中...</div>;
  }

  // 未ログイン → ログイン画面
  if (!firebaseUser) {
    return (
      <Routes>
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    );
  }

  // ログイン済みだがプロフィール未登録 → プロフィール登録画面
  if (!member) {
    return (
      <Routes>
        <Route path="*" element={<ProfileSetupScreen />} />
      </Routes>
    );
  }
 // ログイン済み+プロフィール登録済み → 通常のアプリ
  const isOfficer = member.role === "幹部" || member.role === "管理者";

return (
    <Layout isOfficer={isOfficer}>
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
        <Route path="/chat" element={<ChatScreen />} />
        <Route path="/board" element={<BoardScreen />} />
        <Route path="/board/new" element={<CreatePostScreen />} />
        <Route path="/board/:id" element={<PostDetailScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="/admin/approvals/roles" element={<RoleApprovalsScreen />} />
        <Route path="/admin/approvals/bands" element={<BandApprovalsScreen />} />
        <Route path="/admin/dues" element={<DuesScreen />} />
        <Route path="/admin/history" element={<UserHistoryScreen />} />
        <Route path="/todo" element={<TodoScreen />} />
        <Route path="/equipment" element={<EquipmentScreen  />} />
        <Route path="/equipment/manage" element={<EquipmentManageScreen />} />
        <Route path="/equipment/requests" element={<EquipmentRequestsScreen />} />
        <Route path="/equipment/:id" element={<EquipmentDetailScreen />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;