import { cookies } from "next/headers";
import {
  ACCESS_CATEGORY_COOKIE_NAME,
  ACCESS_PRIVILEGE_MATRIX_COOKIE_NAME,
  categoryPrivileges,
  normalizePrivilegesForCategory,
  normalizeUserCategory,
  type PrivilegeKey,
  type UserCategory,
} from "@/lib/access-control";

export async function getServerAccessContext() {
  const cookieStore = await cookies();
  const category = normalizeUserCategory(cookieStore.get(ACCESS_CATEGORY_COOKIE_NAME)?.value);
  const matrix = readPrivilegeMatrixCookie(cookieStore.get(ACCESS_PRIVILEGE_MATRIX_COOKIE_NAME)?.value);

  return {
    category,
    matrix,
    can: (privilege: PrivilegeKey) => matrix[category].includes(privilege),
  };
}

function readPrivilegeMatrixCookie(value: string | undefined) {
  if (!value) {
    return categoryPrivileges;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<Record<UserCategory, PrivilegeKey[]>>;

    return (Object.keys(categoryPrivileges) as UserCategory[]).reduce(
      (matrix, category) => ({
        ...matrix,
        [category]: normalizePrivilegesForCategory(category, parsed[category]),
      }),
      {} as Record<UserCategory, PrivilegeKey[]>,
    );
  } catch {
    return categoryPrivileges;
  }
}
