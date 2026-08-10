import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthContext";
import type { Todo, TodoStatus } from "../../Types/types";
import { createNotification } from "../../lib/notify";

export interface TodoView extends Todo {
  assigneeName: string;
}

export interface OfficerOption {
  id: string;
  name: string;
}

export function useTodo() {
  const { member: currentMember } = useAuth();
  const [todos, setTodos] = useState<TodoView[]>([]);
  const [officerOptions, setOfficerOptions] = useState<OfficerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TodoStatus | "all">("all");

  const fetchData = async () => {
    try {
      // 幹部メンバー(担当者候補)を取得。active かつ role が幹部/管理者
      const memQ = query(collection(db, "members"), where("status", "==", "active"));
      const memSnap = await getDocs(memQ);
      const nameMap: Record<string, string> = {};
      const officers: OfficerOption[] = [];
      memSnap.docs.forEach((d) => {
        const data = d.data() as { name: string; role: string };
        nameMap[d.id] = data.name;
        if (data.role === "幹部" || data.role === "管理者") {
          officers.push({ id: d.id, name: data.name });
        }
      });
      setOfficerOptions(officers);

      // TODO一覧
      const todoSnap = await getDocs(collection(db, "todos"));
      setTodos(
        todoSnap.docs.map((d) => {
          const t = { id: d.id, ...(d.data() as Omit<Todo, "id">) };
          return { ...t, assigneeName: nameMap[t.assigneeId] ?? "不明" };
        })
      );
    } catch (e) {
      console.error("TODOの取得に失敗しました", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const addTodo = async (input: { title: string; assigneeId: string; deadline: string }) => {
    if (!input.title.trim()) {
      window.alert("タスク名を入力してください。");
      return false;
    }
    if (!currentMember) return false;
    try {
      const newData: Omit<Todo, "id"> = {
        title: input.title.trim(),
        description: "",
        assigneeId: input.assigneeId,
        createdBy: currentMember.id,
        status: "未着手",
        ...(input.deadline ? { deadline: input.deadline } : {}),
      };
      await addDoc(collection(db, "todos"), newData);

      // 担当者に通知(自分以外にアサインした場合)
      if (input.assigneeId && input.assigneeId !== currentMember.id) {
        await createNotification(
          input.assigneeId,
          "todo_assigned",
          `タスク「${input.title.trim()}」が割り当てられました`,
          "/todo"
        );
      }

      await fetchData();
      return true;
    } catch (e) {
      console.error("タスクの追加に失敗しました", e);
      window.alert("追加に失敗しました。");
      return false;
    }
  };

  const changeStatus = async (id: string, status: TodoStatus) => {
    try {
      await updateDoc(doc(db, "todos", id), { status });
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    } catch (e) {
      console.error("ステータスの更新に失敗しました", e);
    }
  };

  const deleteTodo = async (id: string, title: string) => {
    const ok = window.confirm(`タスク「${title}」を削除します。よろしいですか?`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "todos", id));
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error("タスクの削除に失敗しました", e);
      window.alert("削除に失敗しました。");
    }
  };

  const filtered =
    statusFilter === "all" ? todos : todos.filter((t) => t.status === statusFilter);

  return { todos: filtered, officerOptions, loading, statusFilter, setStatusFilter, addTodo, changeStatus, deleteTodo } as const;
}