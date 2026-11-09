import { MongoClient, type Db } from "mongodb";
import { hashPassword } from "./crypto";

const globalMongo = globalThis as unknown as {
  __cloudeasyMongo?: { client: MongoClient; db?: Db; ready?: Promise<Db> };
};

export function adminEmail() {
  return (process.env.ADMIN_EMAIL || "admin@cloudeasy.online").trim().toLowerCase();
}

export function isAdminEmail(email: string) {
  return email.trim().toLowerCase() === adminEmail();
}

export function mongoUri() {
  return (process.env.MONGODB_URI || process.env.MONGO_URI || "").trim();
}

export async function getDb() {
  if (globalMongo.__cloudeasyMongo?.db) return globalMongo.__cloudeasyMongo.db;
  const uri = mongoUri();
  if (!uri) {
    throw new Error("Set MONGODB_URI (or MONGO_URI) in .env to your MongoDB Atlas connection string.");
  }
  if (!globalMongo.__cloudeasyMongo) {
    const client = new MongoClient(uri);
    const slot: { client: MongoClient; db?: Db; ready?: Promise<Db> } = { client };
    slot.ready = client
      .connect()
      .then(async (connected) => {
        const db = connected.db();
        await db.command({ ping: 1 });
        slot.db = db;
        await ensureBaseline(db);
        return db;
      })
      .catch((err) => {
        globalMongo.__cloudeasyMongo = undefined;
        throw err;
      });
    globalMongo.__cloudeasyMongo = slot;
  }
  return globalMongo.__cloudeasyMongo.ready!;
}

export async function mongoStatus() {
  if (!mongoUri()) {
    return { connected: false, database: null as string | null, message: "MONGODB_URI is empty in .env" };
  }
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { connected: true, database: db.databaseName, message: "Connected" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { connected: false, database: null as string | null, message: message.replace(/mongodb(\+srv)?:\/\/\S+/gi, "mongodb://***") };
  }
}

async function ensureBaseline(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("otpChallenges").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("projects").createIndex({ code: 1 }, { unique: true }),
    db.collection("blogPosts").createIndex({ slug: 1 }, { unique: true }),
  ]);

  const settings = db.collection("settings");
  const existing = await settings.findOne({ _id: "app" as never });
  if (!existing) {
    await settings.insertOne({
      _id: "app" as never,
      companyName: "CloudEasy",
      tagline: "DevOps Portal",
      logo: null,
      footer: {
        linkedinUrl: "https://www.linkedin.com/company/cloudeasydevops",
        githubUrl: "https://github.com/cloudeasydevops",
        twitterUrl: "https://twitter.com/cloudeasydevops",
        projectDescription:
          "CloudEasy DevOps Portal is a unified cloud operations management hub providing centralized multi-cloud visibility, secrets encryption, API testing, and automated health checks.",
        points: [
          "Centralized Multi-Cloud Control: Seamlessly oversee AWS, GCP, Azure, and DigitalOcean instances in one place.",
          "Zero-Trust Secrets & Credential Vault: Securely manage and rotate encrypted application keys, tokens, and credentials.",
          "API Studio: Send requests, import cURL, and probe external APIs via a secure server-side proxy.",
          "Proactive Health & SSL Guard: Automated TLS certificate expiry alerts, latency benchmarking, and DNS health tracking.",
          "Streamlined CI/CD & Deployments: Automated release pipeline visibility, webhook alerts, and rollback readiness.",
        ],
      },
    });
  }

  const users = db.collection<Record<string, unknown>>("users");
  const email = adminEmail();
  const admin = await users.findOne({ email });
  const now = new Date();
  if (!admin) {
    await users.insertOne({
      _id: crypto.randomUUID() as never,
      email,
      name: "CloudEasy Admin",
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || crypto.randomUUID()),
      status: "active",
      roleKey: "owner",
      isOwner: true,
      mfaEnabled: false,
      timezone: "Asia/Kolkata",
      notifications: defaultNotifications(),
      createdAt: now,
      updatedAt: now,
    });
  } else if (!admin.isOwner || admin.roleKey !== "owner") {
    await users.updateOne(
      { _id: admin._id },
      { $set: { isOwner: true, roleKey: "owner", status: "active", updatedAt: now } },
    );
  }
}

export function defaultNotifications() {
  return {
    emailEnabled: true,
    slackEnabled: false,
    teamsEnabled: false,
    sslExpiry: true,
    serverDown: true,
    dnsChanges: true,
    deployments: true,
    sshLogin: true,
  };
}

export type AppUser = {
  _id: string;
  email: string;
  name: string;
  passwordHash?: string | null;
  status: string;
  roleKey: string;
  isOwner: boolean;
  mfaEnabled?: boolean;
  mfaSecretEnc?: string | null;
  timezone?: string | null;
  notifications?: Record<string, boolean>;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};
