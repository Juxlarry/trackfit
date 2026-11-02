export const notificationsTypeDefs = /* GraphQL */ `
  type PushConfig {
    "VAPID public key for PushManager.subscribe, or null when push isn't set up on the server."
    publicKey: String
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
  }

  extend type Mutation {
    "Register this browser for notifications. Called on every app open while allowed, which also keeps the time zone current."
    subscribePush(input: PushSubscriptionInput!): Boolean!
    unsubscribePush(endpoint: String!): Boolean!
    "Sends a test notification to every device with notifications on. Returns how many accepted it."
    sendTestPush: Int!
  }
`;
