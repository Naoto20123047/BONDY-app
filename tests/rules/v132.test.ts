/**
 * Firestore ルールのテスト(v1.3.2)
 *
 * エミュレータに対して流す。実行には Java が必要。
 *   npm run test:rules
 *
 * ルールは誤ると既存の部員全員がエラーになるため、デプロイ前に必ず通すこと。
 * 「通るべき操作が通る」と「塞いだ穴が塞がっている」の両方を確かめている。
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
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

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

/** ログインした人として Firestore を使う */
const as = (uid: string, email = `${uid}${UNI}`, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

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
    await setDoc(doc(db, "members", "carol"), member("carol"));
    for (const id of ["o1", "o2", "o3"]) {
      await setDoc(doc(db, "members", id), member(id, { role: "幹部" }));
    }
    await setDoc(doc(db, "members", "gone"), member("gone", { status: "withdrawn" }));
    await setDoc(doc(db, "bands", "b1"), {
      name: "Band1",
      members: [{ memberId: "alice", part: "Gt" }, { memberId: "bob", part: "Ba" }],
      memberIds: ["alice", "bob"],
      status: "承認済み",
    });
    await setDoc(doc(db, "pages", "intro"), { title: "BONDY", lead: "", blocks: [] });
    await setDoc(doc(db, "dues", "d1"), { memberId: "alice", fiscalYear: 2026, paid: true });
    await setDoc(doc(db, "messages", "m1"), {
      senderId: "bob",
      type: "text",
      text: "hi",
      createdAt: "2026-11-01T00:00:00Z",
      reactions: { "👍": ["carol"] },
    });
  });
});

// ---------------------------------------------------------------------------
describe("1. 新規登録", () => {
  it("確認済みの大学アドレスなら登録できる", async () => {
    await assertSucceeds(setDoc(doc(as("new1"), "members", "new1"), member("new1")));
  });
  it("メール未確認では登録できない", async () => {
    await assertFails(
      setDoc(doc(as("new2", `new2${UNI}`, false), "members", "new2"), member("new2"))
    );
  });
  it("大学以外のアドレスでは登録できない", async () => {
    await assertFails(
      setDoc(
        doc(as("new3", "new3@gmail.com"), "members", "new3"),
        member("new3", { email: "new3@gmail.com" })
      )
    );
  });
  it("幹部として登録することはできない", async () => {
    await assertFails(
      setDoc(doc(as("new4"), "members", "new4"), member("new4", { role: "幹部" }))
    );
  });
  it("紹介ページはメール確認済みなら読めるが、未確認では読めない", async () => {
    await assertSucceeds(getDoc(doc(as("v1"), "pages", "intro")));
    await assertFails(getDoc(doc(as("v2", `v2${UNI}`, false), "pages", "intro")));
    // 教員・OBは大学以外のアドレスで登録するため、アドレスの種類は問わない(v1.4.0)
    await assertSucceeds(getDoc(doc(as("v3", "v3@gmail.com"), "pages", "intro")));
  });
  it("既存メンバーは確認メールを通っていなくても使える", async () => {
    const db = as("alice", `alice${UNI}`, false);
    await assertSucceeds(getDoc(doc(db, "pages", "intro")));
    await assertSucceeds(getDocs(collection(db, "members")));
  });
});

// ---------------------------------------------------------------------------
describe("2. 投稿の付け替え", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "posts", "p1"), {
        authorId: "alice",
        category: "その他",
        title: "t",
        body: "b",
        createdAt: "2026-11-01T00:00:00Z",
        resolved: false,
        isAnonymous: false,
      });
    });
  });
  it("投稿者は解決済みを切り替えられる", async () => {
    await assertSucceeds(
      updateDoc(doc(as("alice"), "posts", "p1"), { resolved: true, resolvedAt: "2026-11-02" })
    );
  });
  it("投稿者でも authorId は変えられない", async () => {
    await assertFails(updateDoc(doc(as("alice"), "posts", "p1"), { authorId: "bob" }));
  });
  it("他人の名前で投稿できない", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "posts", "p2"), {
        authorId: "bob",
        category: "その他",
        title: "t",
        body: "b",
        createdAt: "x",
        resolved: false,
        isAnonymous: false,
      })
    );
  });
});

// ---------------------------------------------------------------------------
describe("3. 匿名投稿", () => {
  it("匿名投稿は本体に投稿者を持たず、anonymousAuthors と一緒に作る", async () => {
    const db = as("alice");
    const batch = writeBatch(db);
    batch.set(doc(db, "posts", "ap1"), {
      category: "その他",
      title: "t",
      body: "b",
      createdAt: "x",
      resolved: false,
      isAnonymous: true,
    });
    batch.set(doc(db, "anonymousAuthors", "ap1"), {
      authorId: "alice",
      kind: "post",
      postId: "ap1",
      seenCommentCount: 0,
    });
    await assertSucceeds(batch.commit());

    // 他の部員は投稿者を読めない。幹部と本人は読める
    await assertFails(getDoc(doc(as("bob"), "anonymousAuthors", "ap1")));
    await assertSucceeds(getDoc(doc(as("alice"), "anonymousAuthors", "ap1")));
    await assertSucceeds(getDoc(doc(as("o1"), "anonymousAuthors", "ap1")));
    // 本人は自分の分だけを一覧できる
    await assertSucceeds(
      getDocs(query(collection(as("alice"), "anonymousAuthors"), where("authorId", "==", "alice")))
    );
    await assertFails(getDocs(collection(as("bob"), "anonymousAuthors")));
    // 本人は解決済みを切り替えられる、他人はできない
    await assertSucceeds(updateDoc(doc(as("alice"), "posts", "ap1"), { resolved: true }));
    await assertFails(updateDoc(doc(as("bob"), "posts", "ap1"), { resolved: false }));
  });

  it("匿名投稿に authorId を入れることはできない", async () => {
    const db = as("alice");
    const batch = writeBatch(db);
    batch.set(doc(db, "posts", "ap2"), {
      authorId: "alice",
      category: "その他",
      title: "t",
      body: "b",
      createdAt: "x",
      resolved: false,
      isAnonymous: true,
    });
    batch.set(doc(db, "anonymousAuthors", "ap2"), { authorId: "alice", kind: "post", postId: "ap2" });
    await assertFails(batch.commit());
  });

  it("他人を匿名投稿の投稿者にすることはできない", async () => {
    const db = as("alice");
    const batch = writeBatch(db);
    batch.set(doc(db, "posts", "ap3"), {
      category: "その他",
      title: "t",
      body: "b",
      createdAt: "x",
      resolved: false,
      isAnonymous: true,
    });
    batch.set(doc(db, "anonymousAuthors", "ap3"), { authorId: "bob", kind: "post", postId: "ap3" });
    await assertFails(batch.commit());
  });

  it("既存の匿名投稿を幹部が移行できる", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "posts", "old"), {
        authorId: "alice",
        category: "その他",
        title: "t",
        body: "b",
        createdAt: "x",
        resolved: false,
        isAnonymous: true,
      });
      await setDoc(doc(db, "comments", "oc1"), {
        postId: "old",
        authorId: "bob",
        type: "text",
        body: "c",
        createdAt: "y",
      });
    });
    const db = as("o1");
    const batch = writeBatch(db);
    batch.set(doc(db, "anonymousAuthors", "old"), { authorId: "alice", kind: "post", postId: "old" });
    batch.update(doc(db, "posts", "old"), { authorId: deleteField() });
    batch.set(doc(db, "anonymousAuthors", "oc1"), { authorId: "bob", kind: "comment", postId: "old" });
    batch.update(doc(db, "comments", "oc1"), { anonLabel: "匿名A", authorId: deleteField() });
    await assertSucceeds(batch.commit());
  });
});

// ---------------------------------------------------------------------------
describe("4. フォーム回答", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "formResponses", "r1"), {
        formId: "f1",
        memberId: "alice",
        bandId: "b1",
        answers: { q: "出る" },
        submittedAt: "x",
      });
      await setDoc(doc(db, "formResponses", "r2"), {
        formId: "f2",
        memberId: "alice",
        answers: { q: "a" },
        submittedAt: "x",
      });
    });
  });
  it("同じバンドのメンバーはバンド回答を更新できる", async () => {
    await assertSucceeds(
      updateDoc(doc(as("bob"), "formResponses", "r1"), { answers: { q: "出ない" }, lastEditedBy: "bob" })
    );
  });
  it("バンド外の人はバンド回答を更新できない", async () => {
    await assertFails(updateDoc(doc(as("carol"), "formResponses", "r1"), { answers: {} }));
  });
  it("回答者は書き換えられない", async () => {
    await assertFails(updateDoc(doc(as("bob"), "formResponses", "r1"), { memberId: "bob" }));
  });
  it("他人の個人アンケートは更新できない", async () => {
    await assertFails(updateDoc(doc(as("bob"), "formResponses", "r2"), { answers: {} }));
  });
});

// ---------------------------------------------------------------------------
describe("5. バンド", () => {
  it("メンバーは加入・脱退と解散申請ができる", async () => {
    const db = as("alice");
    await assertSucceeds(
      updateDoc(doc(db, "bands", "b1"), {
        members: [{ memberId: "alice", part: "Gt" }, { memberId: "bob", part: "Ba" }, { memberId: "carol", part: "Dr" }],
        memberIds: ["alice", "bob", "carol"],
      })
    );
    await assertSucceeds(updateDoc(doc(db, "bands", "b1"), { status: "解散申請中" }));
  });
  it("メンバーでもいきなり解散にはできない", async () => {
    await assertFails(updateDoc(doc(as("alice"), "bands", "b1"), { status: "解散" }));
  });
  it("メンバー以外は他のバンドを編集できない", async () => {
    await assertFails(
      updateDoc(doc(as("carol"), "bands", "b1"), {
        members: [{ memberId: "carol", part: "Gt" }],
        memberIds: ["carol"],
      })
    );
  });
  it("結成申請には申請者自身が入っている必要がある", async () => {
    await assertFails(
      setDoc(doc(as("carol"), "bands", "b2"), {
        name: "x",
        members: [{ memberId: "alice", part: "Gt" }],
        memberIds: ["alice"],
        status: "申請中",
      })
    );
    await assertSucceeds(
      setDoc(doc(as("carol"), "bands", "b3"), {
        name: "x",
        members: [{ memberId: "carol", part: "Gt" }],
        memberIds: ["carol"],
        status: "申請中",
      })
    );
  });
});

// ---------------------------------------------------------------------------
describe("7. 役職変更", () => {
  it("幹部でも role / positions を直接は変えられない", async () => {
    await assertFails(updateDoc(doc(as("o1"), "members", "alice"), { positions: ["会計担当"] }));
    await assertFails(updateDoc(doc(as("o1"), "members", "o2"), { role: "一般メンバー" }));
  });
  it("一般メンバーを幹部に昇格するのは即時でよい", async () => {
    await assertSucceeds(updateDoc(doc(as("o1"), "members", "alice"), { role: "幹部" }));
  });
  it("承認が3人そろった申請だけを反映できる", async () => {
    await assertSucceeds(
      setDoc(doc(as("o1"), "roleChangeRequests", "rq1"), {
        type: "assign_position",
        targetMemberId: "alice",
        proposedBy: "o1",
        approvals: ["o1"],
        requiredApprovals: 3,
        status: "pending",
        position: "会計担当",
      })
    );
    // 承認が足りないうちは approved にできない
    await assertFails(
      updateDoc(doc(as("o2"), "roleChangeRequests", "rq1"), {
        approvals: arrayUnion("o2"),
        status: "approved",
      })
    );
    await assertSucceeds(
      updateDoc(doc(as("o2"), "roleChangeRequests", "rq1"), { approvals: arrayUnion("o2") })
    );
    // 反映はまだできない
    await assertFails(
      updateDoc(doc(as("o2"), "members", "alice"), { positions: ["会計担当"], appliedRequestId: "rq1" })
    );
    await assertSucceeds(
      updateDoc(doc(as("o3"), "roleChangeRequests", "rq1"), {
        approvals: arrayUnion("o3"),
        status: "approved",
      })
    );
    await assertSucceeds(
      updateDoc(doc(as("o3"), "members", "alice"), { positions: ["会計担当"], appliedRequestId: "rq1" })
    );
    // 申請と違う内容は反映できない
    await assertFails(
      updateDoc(doc(as("o3"), "members", "bob"), { positions: ["会計担当"], appliedRequestId: "rq1" })
    );
  });
  it("承認の数を水増しできない", async () => {
    await assertFails(
      setDoc(doc(as("o1"), "roleChangeRequests", "rq2"), {
        type: "dismiss_officer",
        targetMemberId: "o2",
        proposedBy: "o1",
        approvals: ["o1", "o3"],
        requiredApprovals: 3,
        status: "pending",
      })
    );
    await assertFails(
      setDoc(doc(as("o1"), "roleChangeRequests", "rq3"), {
        type: "dismiss_officer",
        targetMemberId: "o2",
        proposedBy: "o1",
        approvals: ["o1"],
        requiredApprovals: 1,
        status: "pending",
      })
    );
  });
});

// ---------------------------------------------------------------------------
describe("8. 通知", () => {
  const base = {
    targetMemberId: "bob",
    message: "m",
    link: "/home",
    read: false,
    createdAt: "2026-11-01",
  };
  it("一般メンバーは操作に伴う通知を作れる", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "notifications", "n1"), { ...base, type: "post_comment" }));
  });
  it("一般メンバーは幹部用の通知を作れない", async () => {
    await assertFails(setDoc(doc(as("alice"), "notifications", "n2"), { ...base, type: "approval_result" }));
  });
  it("外部へのリンクは入れられない", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "notifications", "n3"), { ...base, type: "post_comment", link: "https://evil.example" })
    );
    await assertFails(
      setDoc(doc(as("alice"), "notifications", "n4"), { ...base, type: "post_comment", link: "//evil.example" })
    );
  });
});

// ---------------------------------------------------------------------------
describe("9. 会費", () => {
  it("本人と幹部は読めるが、他の部員は読めない", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "dues", "d1")));
    await assertSucceeds(getDoc(doc(as("o1"), "dues", "d1")));
    await assertFails(getDoc(doc(as("bob"), "dues", "d1")));
  });
});

// ---------------------------------------------------------------------------
describe("10. リアクション・スタンプ・アバター", () => {
  it("自分のIDの付け外しはできる", async () => {
    const db = as("alice");
    await assertSucceeds(
      updateDoc(doc(db, "messages", "m1"), new FieldPath("reactions", "👍"), arrayUnion("alice"), "lastReactionKey", "👍")
    );
    await assertSucceeds(
      updateDoc(doc(db, "messages", "m1"), new FieldPath("reactions", "👍"), arrayRemove("alice"), "lastReactionKey", "👍")
    );
  });
  it("他人のIDを入れたり外したりできない", async () => {
    const db = as("alice");
    await assertFails(
      updateDoc(doc(db, "messages", "m1"), new FieldPath("reactions", "🔥"), arrayUnion("bob"), "lastReactionKey", "🔥")
    );
    await assertFails(
      updateDoc(doc(db, "messages", "m1"), new FieldPath("reactions", "👍"), arrayRemove("carol"), "lastReactionKey", "👍")
    );
  });
  it("外部の画像をスタンプにできない", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "messages", "m2"), {
        senderId: "alice",
        type: "stamp",
        stamp: "https://evil.example/a.png",
        createdAt: "x",
      })
    );
    await assertSucceeds(
      setDoc(doc(as("alice"), "messages", "m3"), {
        senderId: "alice",
        type: "stamp",
        stamp: "/stamps/hello.png",
        createdAt: "x",
      })
    );
  });
  it("大きすぎるアバターのサムネイルは入れられない", async () => {
    await assertFails(
      updateDoc(doc(as("alice"), "members", "alice"), {
        avatarThumb: "data:image/webp;base64," + "A".repeat(30000),
      })
    );
    await assertSucceeds(
      updateDoc(doc(as("alice"), "members", "alice"), { avatarThumb: "data:image/webp;base64,AAAA" })
    );
  });
});

// ---------------------------------------------------------------------------
describe("退会", () => {
  it("退会者は名簿を読めない", async () => {
    await assertFails(getDocs(collection(as("gone"), "members")));
  });
});
