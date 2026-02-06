import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  decimal,
  integer,
} from "drizzle-orm/pg-core";

/**
 * Users table.
 * - Streamers have isStreamer true and their own ensDomain (or name) in moderatorsFor.
 * - moderatorsFor: channels/streams this user moderates (streamers include themselves).
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  metamaskAddress: text("metamask_address").notNull().unique(),
  privyAddress: text("privy_address").notNull().unique(),
  ensDomain: text("ens_domain"),
  isStreamer: boolean("is_streamer").notNull().default(false),
  moderatorsFor: text("moderators_for").array().notNull().default([]),
});

/**
 * Followed channels per user.
 * - ens_domain: the user's ENS domain (who is following).
 * - followed_streamers: list of channel/streamer identifiers this user follows.
 */
export const followedChannels = pgTable("followed_channels", {
  ensDomain: text("ens_domain").primaryKey(),
  followedStreamers: text("followed_streamers").array().notNull().default([]),
});

/**
 * Prediction history per user.
 * Stores a user's prediction-related data.
 */
export const predictionHistory = pgTable("prediction_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  streamerName: text("streamer_name").notNull(),
  predictionName: text("prediction_name").notNull(),
  amountInvested: decimal("amount_invested", {
    precision: 18,
    scale: 6,
  }).notNull(),
  profitLoss: decimal("profit_loss", { precision: 18, scale: 6 }).notNull(),
});
