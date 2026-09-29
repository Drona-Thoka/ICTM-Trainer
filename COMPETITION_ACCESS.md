# Competition passwords

AMC 10, AMC 12, and AIME remain public. ICTM and NSML each require a separate
password. Both remain locked while their password is unset or empty.

Set these **server-side** environment variables in Vercel (and `.env` for local
development), then redeploy:

```text
ICTM_ACCESS_PASSWORD=<your ICTM password>
NSML_ACCESS_PASSWORD=<your NSML password>
```

Do not put passwords in a `VITE_*` variable or commit them to the repository.
The password form sends them to the server; the browser receives an HttpOnly,
SameSite=Strict cookie, marked Secure outside local HTTP development. Access
expires after eight hours. Changing a password invalidates existing cookies
for that competition. The Lock button clears that competition's cookie.

The API checks access for random problems, direct problem IDs, solutions,
answer checking, topic/event/year filters, and diagrams. Responses use
`Cache-Control: private, no-store`; query caches are scoped to the database and
the unlocked competitions.

`scripts/snapshot_data.py` includes all competitions in the server database.
`scripts/stage_images.py` keeps only public diagrams in
`ictm-reader/public/images` and stages protected diagrams in
`data/private-images`. Protected image URLs always use `/api/images`, even
when public diagrams use `IMAGE_BASE_URL=/images`. Never copy the private
directory or the database into the frontend's public/build directory.

Validation:

```bash
venv/bin/python -m unittest test_competition_visibility
venv/bin/python test_filters.py
venv/bin/python test_integration.py
npm run build --prefix ictm-reader
```
