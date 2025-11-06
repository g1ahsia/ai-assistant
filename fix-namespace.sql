-- Fix namespace double prefix issue
UPDATE orgs 
SET namespace = org_id 
WHERE namespace LIKE 'org_org_%';

-- Show updated organizations
SELECT org_id, name, namespace FROM orgs;
