export type PublicOwner = {
  id: string;
  displayName: string;
};

export type PublicOwnerSource = {
  showOwnerInPublic: boolean;
  owner:
    | {
        id: string;
        name?: string | null;
        email?: string | null;
      }
    | null
    | undefined;
};

export function maskOwnerEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "hidden";
  }

  const prefixLength = Math.min(3, Math.max(1, localPart.length - 1));
  return `${localPart.slice(0, prefixLength)}***@${domain}`;
}

export function buildPublicOwner(source: PublicOwnerSource): PublicOwner | null {
  if (!source.showOwnerInPublic || !source.owner) {
    return null;
  }

  const name = source.owner.name?.trim();
  if (name) {
    return {
      id: source.owner.id,
      displayName: name,
    };
  }

  const email = source.owner.email?.trim();
  if (!email) {
    return null;
  }

  return {
    id: source.owner.id,
    displayName: maskOwnerEmail(email),
  };
}
