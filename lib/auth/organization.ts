type UserOrganizationInput = {
  userId: string;
  email: string;
  name?: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function buildDefaultOrganization(input: UserOrganizationInput) {
  const emailPrefix = input.email.split('@')[0]?.trim() || 'workspace';
  const ownerName = input.name?.trim() || emailPrefix;
  const name = `${ownerName}'s Workspace`;
  const baseSlug = slugify(ownerName) || 'workspace';
  const uniqueSuffix = input.userId.replace(/-/g, '').slice(0, 8);

  return {
    name,
    slug: `${baseSlug}-${uniqueSuffix}`.slice(0, 100),
  };
}
