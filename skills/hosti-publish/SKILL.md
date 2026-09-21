---
name: hosti-publish
description: Publish a static site to a Hosti catalog and share it. Use when asked to publish, host or share a report, a dashboard, a slide deck, a static site or any folder of static files, or to get a URL for one.
---

# Publish to Hosti

Hosti is a self-hosted catalog for static bundles. A bundle is a folder of
files with an index.html at its root. Pushing it gives it a URL.

This skill covers two jobs: push a bundle, and share it. Nothing else.

## 1. Read the settings

    HOSTI_URL     the base URL of the instance, no trailing slash
    HOSTI_TOKEN   a push token, which starts with hosti_

Both come from the environment. If either is missing, ask the owner for it and
stop until you have it. Do not guess a URL and do not mint a token.

Never print the token. Never write it into a file, a script or a commit
message. Never put its value in a command you show the owner: write
$HOSTI_TOKEN and let the shell expand it, so the transcript keeps the name and
not the secret.

## 2. Check the folder before you push

index.html must sit at the root of the pushed tree, not one directory down. A
tree with exactly one root .html file and no index.html has that file stored as
index.html, which is how a single-page bundle arrives.

Get this wrong and the push is refused with:

    400 {"error":"no_entry_file","message":"No index.html at the root of the pushed tree. Found: docs/, notes.txt"}

Read the "Found:" list. It names what was at the root, which is usually one
directory you should have pushed the inside of.

## 3. Catch absolute references

A link written /assets/x.css asks for the root of the domain. The root of the
domain is the catalog, not the bundle, so that link 404s once the bundle is
served under /v/<slug>/. Links inside a bundle must be relative: assets/x.css,
or ../assets/x.css.

The push API accepts absolute links silently. Nothing downstream warns about
them, so this check is yours:

    grep -rnE '(src|href)="/[^/]' ./out

Fix what it finds, or tell the owner which files will break and let them
decide. Do not rewrite their files without saying so.

## 4. Pick a slug

Lowercase letters, digits and dashes, 1 to 64 characters. It is the last part
of the URL, so make it read like the thing: garmin-q3, sleep-brief,
squad-2026.

A bad slug is refused with:

    400 {"error":"bad_slug","message":"A bundle slug is lowercase letters, digits and dashes, 1 to 64 characters"}

## 5. Push

Pack the folder as a gzipped tar with paths relative to the folder itself, then
post it:

    tar czf /tmp/bundle.tgz -C ./out .
    curl -X POST "$HOSTI_URL/api/v1/bundles/<slug>/revisions" \
      -H "Authorization: Bearer $HOSTI_TOKEN" \
      -H "X-Hosti-Title: Squad 2026" \
      --data-binary @/tmp/bundle.tgz

The -C matters. Packing the parent directory puts out/index.html in the tree
and there is then no index.html at the root.

X-Hosti-Title sets the name the owner reads in the catalog. Without it the
bundle is named after its slug. X-Hosti-Collection puts the bundle in a named
collection, such as reports. Both are optional, and neither can be cleared by
a later push; only the owner clears them in the catalog.

A push answers 201:

    {"bundle":"squad-2026","revision":1,
     "adminUrl":"$HOSTI_URL/b/squad-2026",
     "sharing":{"mode":"private","shareSlug":"squad-2026","hasPin":false},
     "shareUrl":null}

401 means the token is wrong or revoked. Ask the owner for a fresh one rather
than retrying.

## 6. Pushing the same slug again is not an error

It creates the next revision of that bundle and that revision becomes the one
people see. The old share URL keeps working and now shows the new content.

So check whether the slug is already taken before you reuse one. If it is, tell
the owner you are about to replace what is live there, and say what is there
now. Do not silently overwrite a bundle somebody is reading.

## 7. Report the admin URL

Give the owner adminUrl from the response, exactly as it came back. That is
the page where they preview the bundle, set its collection, set a pin and
delete it. It needs their own admin session, so it is not a link they can pass
on.

## 8. Share only when asked

A push never changes who can open a bundle. Every bundle lands private and
stays private until somebody says otherwise. Ask first.

Open it to anyone holding the link:

    curl -X PUT "$HOSTI_URL/api/v1/bundles/<slug>/sharing" \
      -H "Authorization: Bearer $HOSTI_TOKEN" \
      -H "Content-Type: application/json" -d '{"mode":"link"}'

Shut it again:

    curl -X PUT "$HOSTI_URL/api/v1/bundles/<slug>/sharing" \
      -H "Authorization: Bearer $HOSTI_TOKEN" \
      -H "Content-Type: application/json" -d '{"mode":"private"}'

Both answer with shareUrl. Print it. When the mode is private, shareUrl is
null and nothing answers at that address.

## 9. What this skill must not do

Three actions are the owner's, never yours, even when the token would let you:

Do not rotate a share slug. A rotate kills the address for everyone already
holding it, and you cannot know who that is.

Do not delete a bundle. A delete takes its files and every revision with it.

Do not set a pin. A pin is four to eight digits the owner types, and Hosti
never invents one. If the owner wants a pin, tell them to set it on the
bundle's own page in the catalog, at $HOSTI_URL/b/<slug>.
