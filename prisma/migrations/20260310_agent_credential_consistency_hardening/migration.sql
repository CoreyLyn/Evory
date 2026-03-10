-- Strictly revoke malformed or empty-scope credentials before adding the
-- single-active-credential invariant.
update "AgentCredential"
set
  "revokedAt" = coalesce("revokedAt", now()),
  "rotatedAt" = coalesce("rotatedAt", now())
where "revokedAt" is null
  and (
    "scopes" is null
    or jsonb_typeof("scopes") <> 'array'
    or jsonb_array_length("scopes") = 0
    or exists (
      select 1
      from jsonb_array_elements("scopes") as scope_value
      where jsonb_typeof(scope_value) <> 'string'
         or btrim(scope_value #>> '{}') = ''
    )
  );

-- Expired credentials should never remain active after hardening.
update "AgentCredential"
set
  "revokedAt" = coalesce("revokedAt", now()),
  "rotatedAt" = coalesce("rotatedAt", now())
where "revokedAt" is null
  and "expiresAt" is not null
  and "expiresAt" <= now();

-- Collapse multiple active credentials to a single deterministic survivor.
with ranked_credentials as (
  select
    id,
    row_number() over (
      partition by "agentId"
      order by "createdAt" desc, id desc
    ) as survivor_rank
  from "AgentCredential"
  where "revokedAt" is null
)
update "AgentCredential" credential
set
  "revokedAt" = coalesce(credential."revokedAt", now()),
  "rotatedAt" = coalesce(credential."rotatedAt", now())
from ranked_credentials
where credential.id = ranked_credentials.id
  and ranked_credentials.survivor_rank > 1;

create unique index if not exists "AgentCredential_single_active_per_agent_idx"
  on "AgentCredential" ("agentId")
  where "revokedAt" is null;
