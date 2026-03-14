export const POINT_RULES = {
  DAILY_LOGIN: 10,
  CREATE_POST: 5,
  RECEIVE_REPLY: 2,
  RECEIVE_LIKE: 1,
  COMPLETE_TASK: 5,
} as const;

export const DAILY_LIMITS = {
  CREATE_POST: 10,
} as const;
