/**
 * Firestore ルールのテスト(v1.4.1:セキュリティ監査 v1.4.0 の修正)
 *
 *   npm run test:rules
 *
 * 監査レポートの項目番号をテスト名に入れてある。
 * 「塞いだ穴が塞がっている」と「普段の操作が通る」の両方を確かめる。
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

let env: RulesTestEnvironment;
const UNI = "@kaishi-pu.ac.jp";
const DAY = 24 * 60 * 60 * 1000;

const member = (id: string, extra: Record<string, unknown> = {}) => ({
  uid: id,
  email: `${id}${UNI}`,
  authMethod: "email",
  name: `${id}さん`,
  nickname: "",
  category: "在学生",
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

const as = (uid: string, email = `${uid}${UNI}`, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

const now = () => new Date().toISOString();

const activeMembers = (db: ReturnType<typeof as>) =>
  query(collection(db, "members"), where("status", "==", "active"));

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-bondy-v141",
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
    await setDoc(doc(db, "members", "carol"), member("carol"));
    for (const id of ["o1", "o2", "o3", "o4"]) {
      await setDoc(doc(db, "members", id), member(id, { role: "幹部" }));
    }
    // 機材担当(一般メンバー)
    await setDoc(doc(db, "members", "eq"), member("eq", { positions: ["機材担当"] }));
    // 昇格したばかりの幹部
    await setDoc(
      doc(db, "members", "fresh"),
      member("fresh", { role: "幹部", promotedAt: Timestamp.now(), promotedBy: "o1" })
    );
    await setDoc(doc(db, "members", "gone"), member("gone", { status: "expelled" }));
    await setDoc(doc(db, "members", "left"), member("left", { status: "withdrawn" }));
    await setDoc(
      doc(db, "members", "teacher"),
      member("teacher", {
        email: "t@example.com",
        category: "教員",
        faculty: "",
        studentId: "",
        enrollmentYear: 0,
        approved: false,
      })
    );
    await setDoc(doc(db, "bands", "b1"), {
      name: "Band1",
      members: [{ memberId: "alice", part: "Gt" }, { memberId: "bob", part: "Ba" }],
      memberIds: ["alice", "bob"],
      status: "承認済み",
    });
    await setDoc(doc(db, "bands", "pend"), {
      name: "Pending",
      members: [{ memberId: "alice", part: "Gt" }],
      memberIds: ["alice"],
      status: "申請中",
    });
    await setDoc(doc(db, "messages", "m1"), {
      senderId: "bob",
      type: "text",
      text: "hi",
      createdAt: "2026-11-01T00:00:00Z",
    });
    await setDoc(doc(db, "equipment", "e1"), {
      name: "マイク",
      category: "マイク",
      totalQuantity: 3,
      lendable: true,
    });
    await setDoc(doc(db, "forms", "survey"), {
      type: "アンケート",
      title: "s",
      deadline: "2099-01-01",
      questions: [],
      closesAt: Date.now() + DAY,
    });
    await setDoc(doc(db, "forms", "event"), {
      type: "イベント",
      title: "e",
      deadline: "2099-01-01",
      questions: [],
      closesAt: Date.now() + DAY,
    });
    await setDoc(doc(db, "forms", "closed"), {
      type: "アンケート",
      title: "c",
      deadline: "2000-01-01",
      questions: [],
      closesAt: Date.now() - DAY,
    });
    await setDoc(doc(db, "formResponses", "sv-alice"), {
      formId: "survey",
      formType: "アンケート",
      memberId: "alice",
      answers: { q: "秘密" },
      submittedAt: "2026-11-01",
    });
    await setDoc(doc(db, "formResponses", "ev-b1"), {
      formId: "event",
      formType: "イベント",
      memberId: "alice",
      bandId: "b1",
      answers: { q: "出る" },
      submittedAt: "2026-11-01",
    });
    await setDoc(doc(db, "lives", "l1"), {
      title: "冬ライブ",
      applyClosesAt: Date.now() + DAY,
      submitClosesAt: Date.now() + 2 * DAY,
      changeoverMinutes: 10,
      lineup: [],
      lineupBandIds: [],
      createdBy: "o1",
    });
  });
});

// ---------------------------------------------------------------------------
describe("1周目: 登録・ログイン", () => {
  it("1-1 確認待ちの人は幹部の名簿を一覧できない", async () => {
    const db = as("teacher", "t@example.com");
    await assertFails(
      getDocs(query(collection(db, "members"), where("status", "==", "active"), where("role", "==", "幹部")))
    );
    // 自分のドキュメントは読める(起動に必要)
    await assertSucceeds(getDoc(doc(db, "members", "teacher")));
  });

  it("1-3 除籍の記録がある人は、名簿が消えていても登録し直せない", async () => {
    const officer = as("o1");
    const batch = writeBatch(officer);
    batch.update(doc(officer, "members", "carol"), { status: "expelled", expelledAt: "2026-11-02" });
    batch.set(doc(officer, "blockedUids", "carol"), { blockedBy: "o1", blockedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
    await assertSucceeds(deleteDoc(doc(officer, "members", "carol")));
    await assertFails(setDoc(doc(as("carol"), "members", "carol"), member("carol")));
    // 記録の無い人は登録できる
    await assertSucceeds(setDoc(doc(as("dave"), "members", "dave"), member("dave")));
  });

  it("1-3 除籍の記録は幹部しか作れない", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "blockedUids", "bob"), { blockedBy: "alice", blockedAt: serverTimestamp() })
    );
    await assertFails(getDoc(doc(as("alice"), "blockedUids", "bob")));
  });
});

// ---------------------------------------------------------------------------
describe("2周目: 入力値の型と大きさ", () => {
  it("2-1 チャットの本文に文字列以外は入れられない", async () => {
    const db = as("alice");
    await assertFails(
      setDoc(doc(db, "messages", "bad"), {
        senderId: "alice",
        type: "text",
        text: { $$typeof: "x" },
        createdAt: now(),
      })
    );
    await assertSucceeds(
      setDoc(doc(db, "messages", "ok"), { senderId: "alice", type: "text", text: "こんにちは", createdAt: now() })
    );
  });

  it("2-1 プロフィールのパートとニックネームに別の型は入れられない", async () => {
    const db = as("alice");
    await assertFails(updateDoc(doc(db, "members", "alice"), { parts: "Gt" }));
    await assertFails(updateDoc(doc(db, "members", "alice"), { nickname: { a: 1 } }));
    await assertSucceeds(updateDoc(doc(db, "members", "alice"), { parts: ["Gt", "Vo"], nickname: "あり" }));
  });

  it("2-1 新規登録で positions を空の文字列にできない・決まった項目以外を足せない(3-9)", async () => {
    await assertFails(setDoc(doc(as("x1"), "members", "x1"), member("x1", { positions: "" })));
    await assertFails(setDoc(doc(as("x2"), "members", "x2"), member("x2", { approvedBy: "o1" })));
  });

  it("2-2 チャット・名前の長さに上限がある", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "messages", "long"), {
        senderId: "alice",
        type: "text",
        text: "あ".repeat(2001),
        createdAt: now(),
      })
    );
    await assertFails(setDoc(doc(as("x3"), "members", "x3"), member("x3", { name: "あ".repeat(51) })));
  });

  it("2-3 リアクションはアプリの絵文字と画像スタンプだけ", async () => {
    const db = as("alice");
    await assertFails(
      updateDoc(doc(db, "messages", "m1"), new FieldPath("reactions", "嫌がらせ"), arrayUnion("alice"), "lastReactionKey", "嫌がらせ")
    );
    await assertSucceeds(
      updateDoc(doc(db, "messages", "m1"), new FieldPath("reactions", "👍"), arrayUnion("alice"), "lastReactionKey", "👍")
    );
    await assertSucceeds(
      updateDoc(
        doc(db, "messages", "m1"),
        new FieldPath("reactions", "/stamps/hello.png"),
        arrayUnion("alice"),
        "lastReactionKey",
        "/stamps/hello.png"
      )
    );
  });

  it("11-1 アバター画像は JPEG・WebP・PNG で約100KBまで", async () => {
    const db = as("alice");
    await assertFails(
      setDoc(doc(db, "images", "alice"), {
        ownerId: "alice",
        dataUrl: "data:image/svg+xml;base64,AAAA",
        updatedAt: "x",
      })
    );
    await assertFails(
      setDoc(doc(db, "images", "alice"), {
        ownerId: "alice",
        dataUrl: "data:image/webp;base64," + "A".repeat(150000),
        updatedAt: "x",
      })
    );
    await assertSucceeds(
      setDoc(doc(db, "images", "alice"), { ownerId: "alice", dataUrl: "data:image/webp;base64,AAAA", updatedAt: "x" })
    );
  });
});

// ---------------------------------------------------------------------------
describe("3・23・26周目: 幹部の権限", () => {
  const request = (id: string, extra: Record<string, unknown> = {}) => ({
    type: "dismiss_officer",
    targetMemberId: "o4",
    proposedBy: "o1",
    approvals: ["o1"],
    requiredApprovals: 3,
    status: "pending",
    ...extra,
  });

  it("3-1 反映済みの申請は使い回せない", async () => {
    await assertSucceeds(setDoc(doc(as("o1"), "roleChangeRequests", "rq"), request("rq")));
    await assertSucceeds(updateDoc(doc(as("o2"), "roleChangeRequests", "rq"), { approvals: arrayUnion("o2") }));
    const db = as("o3");
    const batch = writeBatch(db);
    batch.update(doc(db, "roleChangeRequests", "rq"), {
      approvals: arrayUnion("o3"),
      status: "applied",
      appliedAt: serverTimestamp(),
    });
    batch.update(doc(db, "members", "o4"), { role: "一般メンバー", positions: [], appliedRequestId: "rq" });
    await assertSucceeds(batch.commit());

    // o4 がもう一度幹部になった後で、同じ申請を使ってまた降格させることはできない
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "members", "o4"), { role: "幹部", appliedRequestId: deleteField() });
    });
    await assertFails(
      updateDoc(doc(as("o1"), "members", "o4"), { role: "一般メンバー", positions: [], appliedRequestId: "rq" })
    );
  });

  it("3-1 v1.4.0 までの approved のまま残った申請は反映に使えない", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "roleChangeRequests", "old"),
        request("old", { approvals: ["o1", "o2", "o3"], status: "approved" })
      );
    });
    await assertFails(
      updateDoc(doc(as("o1"), "members", "o4"), { role: "一般メンバー", positions: [], appliedRequestId: "old" })
    );
  });

  it("3-2 幹部1人で他の幹部を除籍・退会処理できない。一般メンバーならできる", async () => {
    await assertFails(updateDoc(doc(as("o1"), "members", "o2"), { status: "expelled", expelledAt: "2026-11-02" }));
    await assertFails(updateDoc(doc(as("o1"), "members", "o2"), { status: "withdrawn", withdrawnAt: "2026-11-02" }));
    await assertSucceeds(updateDoc(doc(as("o1"), "members", "bob"), { status: "expelled", expelledAt: "2026-11-02" }));
  });

  it("23-1 昇格には昇格の時刻(サーバーの時刻)が必要", async () => {
    await assertFails(updateDoc(doc(as("o1"), "members", "alice"), { role: "幹部" }));
    await assertFails(
      updateDoc(doc(as("o1"), "members", "alice"), {
        role: "幹部",
        promotedAt: Timestamp.fromMillis(Date.now() - 30 * DAY),
        promotedBy: "o1",
      })
    );
    await assertSucceeds(
      updateDoc(doc(as("o1"), "members", "alice"), { role: "幹部", promotedAt: serverTimestamp(), promotedBy: "o1" })
    );
  });

  it("23-1 昇格の時刻は後から書き換えられない", async () => {
    await assertFails(
      updateDoc(doc(as("o1"), "members", "fresh"), { promotedAt: Timestamp.fromMillis(Date.now() - 30 * DAY) })
    );
    await assertFails(updateDoc(doc(as("fresh"), "members", "fresh"), { promotedAt: deleteField() }));
  });

  it("23-1 昇格から14日間は、申請・承認・却下に加われない", async () => {
    await assertFails(
      setDoc(doc(as("fresh"), "roleChangeRequests", "f1"), request("f1", { proposedBy: "fresh", approvals: ["fresh"] }))
    );
    await assertSucceeds(setDoc(doc(as("o1"), "roleChangeRequests", "rq"), request("rq")));
    await assertFails(updateDoc(doc(as("fresh"), "roleChangeRequests", "rq"), { approvals: arrayUnion("fresh") }));
    await assertFails(
      updateDoc(doc(as("fresh"), "roleChangeRequests", "rq"), { status: "rejected", rejectedBy: "fresh" })
    );
  });

  it("26-1 申請の対象者は却下できない。他の幹部はできる", async () => {
    await assertSucceeds(setDoc(doc(as("o1"), "roleChangeRequests", "rq"), request("rq")));
    await assertFails(updateDoc(doc(as("o4"), "roleChangeRequests", "rq"), { status: "rejected", rejectedBy: "o4" }));
    await assertSucceeds(updateDoc(doc(as("o2"), "roleChangeRequests", "rq"), { status: "rejected", rejectedBy: "o2" }));
  });

  it("6-2 役職変更の申請は幹部しか読めない", async () => {
    await assertSucceeds(setDoc(doc(as("o1"), "roleChangeRequests", "rq"), request("rq")));
    await assertFails(getDoc(doc(as("alice"), "roleChangeRequests", "rq")));
    await assertSucceeds(getDoc(doc(as("o2"), "roleChangeRequests", "rq")));
  });

  it("降格の申請は幹部にしか出せない", async () => {
    await assertFails(setDoc(doc(as("o1"), "roleChangeRequests", "rq"), request("rq", { targetMemberId: "alice" })));
  });
});

// ---------------------------------------------------------------------------
describe("3周目: バンド・フォーム・機材・投稿", () => {
  it("3-3 判定用のIDだけを差し替えて隠れメンバーを作れない", async () => {
    await assertFails(
      updateDoc(doc(as("alice"), "bands", "b1"), { memberIds: ["alice", "carol"] })
    );
    await assertSucceeds(
      updateDoc(doc(as("alice"), "bands", "b1"), {
        members: [{ memberId: "alice", part: "Gt" }, { memberId: "carol", part: "Ba" }],
        memberIds: ["alice", "carol"],
      })
    );
  });

  it("3-5 締切を過ぎたフォーム・存在しないフォーム・種類の合わない回答は作れない", async () => {
    const db = as("bob");
    const base = { memberId: "bob", answers: { q: "a" }, submittedAt: "2026-11-02" };
    await assertFails(setDoc(doc(db, "formResponses", "x1"), { ...base, formId: "closed", formType: "アンケート" }));
    await assertFails(setDoc(doc(db, "formResponses", "x2"), { ...base, formId: "nope", formType: "アンケート" }));
    await assertFails(
      setDoc(doc(db, "formResponses", "x3"), { ...base, formId: "survey", formType: "アンケート", bandId: "b1" })
    );
    await assertFails(setDoc(doc(db, "formResponses", "x4"), { ...base, formId: "event", formType: "イベント" }));
    await assertSucceeds(setDoc(doc(db, "formResponses", "x5"), { ...base, formId: "survey", formType: "アンケート" }));
    await assertSucceeds(
      setDoc(doc(db, "formResponses", "x6"), { ...base, formId: "event", formType: "イベント", bandId: "b1" })
    );
  });

  it("5-4 個別アンケートの回答は本人と幹部しか読めない。バンドフォームは部員が読める", async () => {
    await assertFails(getDoc(doc(as("bob"), "formResponses", "sv-alice")));
    await assertSucceeds(getDoc(doc(as("alice"), "formResponses", "sv-alice")));
    await assertSucceeds(getDoc(doc(as("o1"), "formResponses", "sv-alice")));
    await assertSucceeds(
      getDocs(
        query(
          collection(as("bob"), "formResponses"),
          where("formId", "==", "event"),
          where("formType", "==", "イベント")
        )
      )
    );
    await assertFails(getDocs(query(collection(as("bob"), "formResponses"), where("formId", "==", "survey"))));
  });

  it("3-6 機材の申請は台帳にある数まで。承認前に返却報告はできない", async () => {
    const db = as("alice");
    const req = (q: number, equipmentId = "e1") => ({
      equipmentId,
      quantity: q,
      memberId: "alice",
      dueDate: "2026-11-10",
      status: "申請中",
      requestedAt: "2026-11-02",
    });
    await assertFails(setDoc(doc(db, "equipmentRequests", "r1"), req(4)));
    await assertFails(setDoc(doc(db, "equipmentRequests", "r2"), req(1, "nope")));
    await assertSucceeds(setDoc(doc(db, "equipmentRequests", "r3"), req(2)));
    await assertFails(
      updateDoc(doc(db, "equipmentRequests", "r3"), { status: "返却報告済み", reportedAt: "2026-11-03" })
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "equipmentRequests", "r3"), { status: "貸出中" });
    });
    await assertSucceeds(
      updateDoc(doc(db, "equipmentRequests", "r3"), { status: "返却報告済み", reportedAt: "2026-11-03" })
    );
  });

  it("3-7 作成日時はサーバーの時刻と近くなければならない", async () => {
    const db = as("alice");
    const post = (createdAt: string) => ({
      authorId: "alice",
      category: "その他",
      title: "t",
      body: "b",
      createdAt,
      resolved: false,
      isAnonymous: false,
    });
    await assertFails(setDoc(doc(db, "posts", "p1"), post("2099-01-01T00:00:00.000Z")));
    await assertFails(setDoc(doc(db, "posts", "p2"), post("2020-01-01T00:00:00.000Z")));
    await assertFails(setDoc(doc(db, "posts", "p3"), post("x")));
    await assertSucceeds(setDoc(doc(db, "posts", "p4"), post(now())));
  });

  it("3-8 解決済みの投稿を投稿者以外が消せるのは、解決から7日後", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const base = { authorId: "alice", category: "その他", title: "t", body: "b", createdAt: "x", isAnonymous: false };
      await setDoc(doc(db, "posts", "new"), { ...base, resolved: true, resolvedTs: Timestamp.now() });
      await setDoc(doc(db, "posts", "old"), {
        ...base,
        resolved: true,
        resolvedTs: Timestamp.fromMillis(Date.now() - 8 * DAY),
      });
      await setDoc(doc(db, "posts", "legacy"), { ...base, resolved: true, resolvedAt: "2020-01-01" });
    });
    await assertFails(deleteDoc(doc(as("bob"), "posts", "new")));
    await assertFails(deleteDoc(doc(as("bob"), "posts", "legacy")));
    await assertSucceeds(deleteDoc(doc(as("bob"), "posts", "old")));
  });

  it("3-4 匿名スレッドで「投稿者」を名乗れるのは投稿者本人だけ", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "posts", "ap"), {
        category: "その他",
        title: "t",
        body: "b",
        createdAt: "x",
        resolved: false,
        isAnonymous: true,
      });
      await setDoc(doc(db, "anonymousAuthors", "ap"), { authorId: "alice", kind: "post", postId: "ap" });
    });
    const write = async (uid: string, id: string, anonLabel: string) => {
      const db = as(uid);
      const batch = writeBatch(db);
      batch.set(doc(db, "comments", id), { postId: "ap", anonLabel, type: "text", body: "c", createdAt: now() });
      batch.set(doc(db, "anonymousAuthors", id), { authorId: uid, kind: "comment", postId: "ap" });
      return batch.commit();
    };
    await assertFails(write("bob", "c1", "投稿者"));
    await assertSucceeds(write("bob", "c2", "匿名A"));
    await assertSucceeds(write("alice", "c3", "投稿者"));
  });

  it("8周目 メッセージを最初からリアクション付きで作れない", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "messages", "r"), {
        senderId: "alice",
        type: "text",
        text: "hi",
        createdAt: now(),
        reactions: { "👍": ["bob", "carol"] },
      })
    );
  });
});

// ---------------------------------------------------------------------------
describe("5・9・10・27周目: チャット・通知・ライブ・名簿", () => {
  it("5-2 幹部はメッセージを非表示にでき、一般メンバーはできない", async () => {
    await assertFails(
      updateDoc(doc(as("alice"), "messages", "m1"), { hiddenBy: "alice", hiddenAt: serverTimestamp() })
    );
    await assertSucceeds(
      updateDoc(doc(as("o1"), "messages", "m1"), { hiddenBy: "o1", hiddenAt: serverTimestamp() })
    );
    // 幹部でも本文は書き換えられない
    await assertFails(updateDoc(doc(as("o1"), "messages", "m1"), { text: "改ざん" }));
    await assertSucceeds(
      updateDoc(doc(as("o1"), "messages", "m1"), { hiddenBy: deleteField(), hiddenAt: deleteField() })
    );
  });

  it("5-6 幹部の操作の記録は、自分の操作として作れて、書き換えられない", async () => {
    const entry = (actorId: string) => ({ actorId, action: "expel", targetId: "bob", detail: "", at: serverTimestamp() });
    await assertFails(setDoc(doc(as("o1"), "auditLogs", "a1"), entry("o2")));
    await assertSucceeds(setDoc(doc(as("o1"), "auditLogs", "a2"), entry("o1")));
    await assertFails(updateDoc(doc(as("o1"), "auditLogs", "a2"), { detail: "x" }));
    await assertFails(deleteDoc(doc(as("o1"), "auditLogs", "a2")));
    await assertFails(setDoc(doc(as("alice"), "auditLogs", "a3"), entry("alice")));
  });

  it("9-1 通知には差出人が必要で、他人の名前では作れない", async () => {
    const n = { type: "post_comment", message: "m", link: "/home", read: false, createdAt: "2026-11-02", targetMemberId: "bob" };
    await assertFails(setDoc(doc(as("alice"), "notifications", "n1"), n));
    await assertFails(setDoc(doc(as("alice"), "notifications", "n2"), { ...n, createdBy: "o1" }));
    await assertSucceeds(setDoc(doc(as("alice"), "notifications", "n3"), { ...n, createdBy: "alice" }));
  });

  it("9-1 一般メンバーの通知は、種類ごとに宛先が決まっている", async () => {
    const n = (type: string, targetMemberId: string) => ({
      type,
      targetMemberId,
      message: "m",
      link: "/home",
      read: false,
      createdAt: "2026-11-02",
      createdBy: "alice",
    });
    const db = as("alice");
    await assertFails(setDoc(doc(db, "notifications", "a"), n("band_member_changed", "bob")));
    await assertSucceeds(setDoc(doc(db, "notifications", "b"), n("band_member_changed", "o1")));
    await assertFails(setDoc(doc(db, "notifications", "c"), n("equipment_request", "bob")));
    await assertSucceeds(setDoc(doc(db, "notifications", "d"), n("equipment_request", "eq")));
    await assertFails(setDoc(doc(db, "notifications", "e"), n("approval_needed", "o1")));
  });

  it("10-1 承認前のバンドは出演を申し込めない", async () => {
    const entry = (bandId: string) => ({
      bandId,
      bandName: "x",
      participate: true,
      desiredMinutes: 20,
      unavailable: "",
      note: "",
      updatedBy: "alice",
      updatedAt: now(),
    });
    await assertFails(setDoc(doc(as("alice"), "lives", "l1", "entries", "pend"), entry("pend")));
    await assertSucceeds(setDoc(doc(as("alice"), "lives", "l1", "entries", "b1"), entry("b1")));
  });

  it("27-1 一般メンバーは退会・除籍した人を読めない。幹部は読める", async () => {
    await assertFails(getDocs(collection(as("alice"), "members")));
    await assertFails(getDoc(doc(as("alice"), "members", "gone")));
    await assertFails(
      getDocs(query(collection(as("alice"), "members"), where("status", "in", ["withdrawn", "expelled"])))
    );
    await assertSucceeds(getDocs(activeMembers(as("alice"))));
    await assertSucceeds(getDoc(doc(as("alice"), "members", "bob")));
    await assertSucceeds(getDocs(collection(as("o1"), "members")));
    await assertSucceeds(getDoc(doc(as("o1"), "members", "gone")));
    // 退会した本人は自分のドキュメントを読める(復帰画面に必要)
    await assertSucceeds(getDoc(doc(as("left"), "members", "left")));
  });
});
