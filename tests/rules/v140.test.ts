/**
 * Firestore ルールのテスト(v1.4.0:教員・OBの登録、メールアドレスの変更、ライブ準備)
 *
 *   npm run test:rules
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

let env: RulesTestEnvironment;
const UNI = "@kaishi-pu.ac.jp";

const member = (id: string, extra: Record<string, unknown> = {}) => ({
  uid: id,
  email: `${id}${UNI}`,
  authMethod: "email",
  name: `${id}さん`,
  faculty: "情報学部",
  studentId: "24000001",
  enrollmentYear: 2024,
  parts: ["Gt"],
  role: "一般メンバー",
  positions: [],
  isOB: false,
  duesPaid: false,
  status: "active",
  joinedAt: "2026-04-01",
  ...extra,
});

const guest = (id: string, category: "教員" | "OB", email: string) =>
  member(id, {
    email,
    category,
    faculty: "",
    studentId: "",
    enrollmentYear: 0,
    isOB: category === "OB",
    approved: false,
  });

const as = (uid: string, email = `${uid}${UNI}`, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

const DAY = 24 * 60 * 60 * 1000;

const live = (extra: Record<string, unknown> = {}) => ({
  title: "冬ライブ",
  date: "2026-12-20",
  venue: "学内ホール",
  openTime: "17:30",
  startTime: "18:00",
  closeTime: "21:00",
  applyDeadline: "2026-12-01",
  submitDeadline: "2026-12-10",
  applyClosesAt: Date.now() + DAY,
  submitClosesAt: Date.now() + 2 * DAY,
  changeoverMinutes: 10,
  lineup: [],
  lineupBandIds: [],
  createdBy: "o1",
  createdAt: "2026-11-01T00:00:00Z",
  ...extra,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-bondy",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "members", "alice"), member("alice"));
    await setDoc(doc(db, "members", "bob"), member("bob"));
    await setDoc(doc(db, "members", "o1"), member("o1", { role: "幹部" }));
    await setDoc(doc(db, "members", "teacher"), guest("teacher", "教員", "t@example.com"));
    await setDoc(doc(db, "bands", "b1"), {
      name: "Band1",
      members: [{ memberId: "alice", part: "Gt" }],
      memberIds: ["alice"],
      status: "承認済み",
    });
    await setDoc(doc(db, "pages", "intro"), { title: "BONDY", lead: "", blocks: [] });
    await setDoc(doc(db, "lives", "l1"), live());
    await setDoc(
      doc(db, "lives", "l2"),
      live({
        lineup: [{ bandId: "b1", bandName: "Band1", minutes: 20 }],
        lineupBandIds: ["b1"],
        lineupPublishedAt: "2026-11-02T00:00:00Z",
      })
    );
    await setDoc(
      doc(db, "lives", "closed"),
      live({ applyClosesAt: Date.now() - DAY, submitClosesAt: Date.now() - DAY })
    );
  });
});

describe("教員・OBの登録", () => {
  it("教員は大学以外のアドレスでも、確認待ちとして登録できる", async () => {
    await assertSucceeds(
      setDoc(doc(as("t2", "t2@example.com"), "members", "t2"), guest("t2", "教員", "t2@example.com"))
    );
  });
  it("確認待ちにせず登録することはできない", async () => {
    const data = { ...guest("t3", "OB", "t3@example.com"), approved: true };
    await assertFails(setDoc(doc(as("t3", "t3@example.com"), "members", "t3"), data));
  });
  it("大学以外のアドレスで在学生として登録できない", async () => {
    await assertFails(
      setDoc(
        doc(as("s1", "s1@gmail.com"), "members", "s1"),
        member("s1", { email: "s1@gmail.com", category: "在学生" })
      )
    );
  });
  it("メール未確認では教員・OBも登録できない", async () => {
    await assertFails(
      setDoc(
        doc(as("t4", "t4@example.com", false), "members", "t4"),
        guest("t4", "教員", "t4@example.com")
      )
    );
  });
  it("確認待ちの人は名簿・チャットを読めないが、紹介ページと幹部の一覧は読める", async () => {
    const db = as("teacher", "t@example.com");
    await assertFails(getDocs(collection(db, "members")));
    await assertFails(getDocs(collection(db, "messages")));
    await assertSucceeds(getDoc(doc(db, "pages", "intro")));
    await assertSucceeds(
      getDocs(
        query(collection(db, "members"), where("status", "==", "active"), where("role", "==", "幹部"))
      )
    );
  });
  it("確認待ちの人は幹部にだけ承認依頼の通知を作れる", async () => {
    const db = as("teacher", "t@example.com");
    const n = { type: "approval_needed", message: "m", link: "/admin", read: false, createdAt: "x" };
    await assertSucceeds(setDoc(doc(db, "notifications", "n1"), { ...n, targetMemberId: "o1" }));
    await assertFails(setDoc(doc(db, "notifications", "n2"), { ...n, targetMemberId: "alice" }));
  });
  it("幹部は承認できる", async () => {
    await assertSucceeds(updateDoc(doc(as("o1"), "members", "teacher"), { approved: true }));
    await assertSucceeds(getDocs(collection(as("teacher", "t@example.com"), "members")));
  });
  it("本人が自分を承認することはできない", async () => {
    await assertFails(updateDoc(doc(as("teacher", "t@example.com"), "members", "teacher"), { approved: true }));
  });
});

describe("メールアドレスの変更", () => {
  it("名簿のアドレスは、ログイン中のアドレスにだけ合わせられる", async () => {
    await assertSucceeds(updateDoc(doc(as("alice", "alice@example.com"), "members", "alice"), { email: "alice@example.com" }));
    await assertFails(updateDoc(doc(as("bob"), "members", "bob"), { email: "other@example.com" }));
  });
  it("外部のアドレスに変えた後もログインして使える", async () => {
    await assertSucceeds(getDocs(collection(as("alice", "alice@example.com", true), "members")));
  });
});

describe("ライブ準備", () => {
  const entry = (by: string) => ({
    bandId: "b1",
    bandName: "Band1",
    participate: true,
    desiredMinutes: 20,
    unavailable: "",
    note: "",
    updatedBy: by,
    updatedAt: "x",
  });

  it("ライブを作れるのは幹部だけ", async () => {
    await assertSucceeds(setDoc(doc(as("o1"), "lives", "new"), live()));
    await assertFails(setDoc(doc(as("alice"), "lives", "new2"), live({ createdBy: "alice" })));
  });
  it("バンドのメンバーは締切前に申し込める", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "lives", "l1", "entries", "b1"), entry("alice")));
  });
  it("バンド外の人や締切後は申し込めない", async () => {
    await assertFails(setDoc(doc(as("bob"), "lives", "l1", "entries", "b1"), entry("bob")));
    await assertFails(setDoc(doc(as("alice"), "lives", "closed", "entries", "b1"), entry("alice")));
  });
  it("出演が決まったバンドだけがセットリストを提出できる", async () => {
    const setlist = { bandId: "b1", items: [], submittedAt: "x", updatedBy: "alice" };
    await assertSucceeds(setDoc(doc(as("alice"), "lives", "l2", "setlists", "b1"), setlist));
    // 出演順が公開される前は提出できない
    await assertFails(setDoc(doc(as("alice"), "lives", "l1", "setlists", "b1"), setlist));
    // メンバー以外は提出できない
    await assertFails(
      setDoc(doc(as("bob"), "lives", "l2", "setlists", "b1"), { ...setlist, updatedBy: "bob" })
    );
  });
  it("確認待ちの人はライブを読めない", async () => {
    await assertFails(getDoc(doc(as("teacher", "t@example.com"), "lives", "l1")));
  });
});
