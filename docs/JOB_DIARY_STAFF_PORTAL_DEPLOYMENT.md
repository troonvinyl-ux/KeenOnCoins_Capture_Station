# Job Diary staff portal deployment

This workflow publishes three static areas together so a Pages deployment does not replace one site with another:

- Capture Station: repository root
- MyGab TV: `/mygab-tv/`
- Job Diary staff portal: `/job-diary/`

The Job Diary source remains in the private `troonvinyl-ux/JobDiary` repository. No Job Diary source or database is copied into this public repository.

## Required setup before running the workflow

1. In this repository, open **Settings → Secrets and variables → Actions → Secrets**.
2. Add `JOBDIARY_READ_TOKEN`: a fine-grained GitHub token with **read-only Contents access** to the private `troonvinyl-ux/JobDiary` repository. Do not paste the token into a file, workflow, issue, or chat.
3. Verify the existing Job Diary `.env` contains only the public client configuration required for its browser build (`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Never put a service-role key or private credential into the web build.
4. In the existing Supabase-compatible backend, inspect and test row-level security for both `jobs` and `job_actions`. Confirm anonymous users cannot select, insert, update, or delete records, and that authorised staff accounts have only the permissions intended for them. The client-side login screen is not a substitute for database policies.
5. Configure the backend Auth redirect/URL allow-list for the published staff portal origin, including the `/job-diary` base path as applicable.

## Deploy

- Open **Actions → Deploy Capture Station, MyGab TV and Job Diary**.
- Run the workflow manually.
- The workflow builds the site, but deployment is skipped unless the manual `staff_rls_verified` input is checked.
- Only check that input after the database permission tests above have passed. Alternatively, an administrator can set repository variable `STAFF_RLS_VERIFIED=true` after those tests; this enables automatic combined deployments.

Expected URLs after a successful Pages deployment:

- Capture Station: `https://troonvinyl-ux.github.io/KeenOnCoins_Capture_Station/`
- MyGab TV: `https://troonvinyl-ux.github.io/KeenOnCoins_Capture_Station/mygab-tv/`
- Job Diary: `https://troonvinyl-ux.github.io/KeenOnCoins_Capture_Station/job-diary/staff/`

## Important limitations

- GitHub Pages is static hosting; it does not protect job data by itself.
- The workflow does not change the database schema, create users, or alter RLS policies.
- The current staff sign-in route checks for a Supabase session in the browser. Database RLS must independently enforce access to all job records and actions.
- This workflow has not been run against the live backend yet. Verify the build output and unauthorised-access tests before enabling deployment.
