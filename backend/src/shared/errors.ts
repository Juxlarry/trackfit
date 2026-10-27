import { GraphQLError } from "graphql";

/** A client-correctable input problem. Shows up as extensions.code = BAD_USER_INPUT. */
export function badInput(message: string, issues?: { field: string; message: string }[]): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT", issues: issues ?? [] } });
}

export function notFound(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "NOT_FOUND" } });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function assertIsoDate(value: string, field = "date"): string {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z"))) {
    throw badInput(`${field} must be a date in YYYY-MM-DD format.`, [{ field, message: "Use YYYY-MM-DD." }]);
  }
  return value;
}
