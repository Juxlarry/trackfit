export const notificationsTypeDefs = /* GraphQL */ `
  type PushConfig {
    "VAPID public key for PushManager.subscribe, or null when push isn't set up on the server."
    publicKey: String
  }

  "Optional reminders, each on unless turned off. The workout reminder time is ActivePlan.profile.reminderTime."
  type ReminderPrefs {
    "07:30 on plan days 7, 14, 21, 28 and 35."
    weighIn: Boolean!
    "07:30 when the Week 3 and Week 6 photo slots open."
    progressPhotos: Boolean!
    "08:00 the day after a planned session with no workout logged."
    missedSession: Boolean!
    "When a coach sets a new challenge in one of your clubs."
    clubChallenges: Boolean!
  }

  input ReminderPrefsInput {
    weighIn: Boolean!
    progressPhotos: Boolean!
    missedSession: Boolean!
    "Left out: unchanged."
    clubChallenges: Boolean
  }

  input PushSubscriptionInput {
    endpoint: String!
    p256dh: String!
    auth: String!
    "IANA time zone from the browser, e.g. Africa/Accra. Reminder times are local to it."
    timeZone: String!
  }

  extend type Query {
    pushConfig: PushConfig!
    reminderPrefs: ReminderPrefs!
  }

  extend type Mutation {
    "Register this browser for notifications. Called on every app open while allowed, which also keeps the time zone current."
    subscribePush(input: PushSubscriptionInput!): Boolean!
    unsubscribePush(endpoint: String!): Boolean!
    setReminderPrefs(input: ReminderPrefsInput!): ReminderPrefs!
    "Sends a test notification to every device with notifications on. Returns how many accepted it."
    sendTestPush: Int!
  }
`;
