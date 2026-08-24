import type { User } from "@inkademy/db";
import type { AuthUser } from "@inkademy/shared";

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    globalRole: user.globalRole,
    locale: user.locale,
    timezone: user.timezone,
    profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
  };
}
