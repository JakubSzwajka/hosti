---
name: hosti-publish
description: Publish a static site to a Hosti catalog and share it. Use when asked to publish, host or share a report, a dashboard, a slide deck, a static site or any folder of static files, or to get a URL for one.
---

# Publish to Hosti

Hosti is a self-hosted catalog for static bundles. A bundle is a folder of
files with an index.html at its root. Pushing it gives it a URL.

You work through the `hosti` command. This skill covers pushing a bundle,
sharing it, rotating its link and opening it. It covers deleting only under
the rule in step 9.

## 1. Get the CLI

Check for it:

    hosti --help

If the command is missing, install it. It needs Node 24.21.0 or later, so
check `node --version` first:

    npm install -g https://github.com/JakubSzwajka/hosti/releases/latest/download/hosti-cli.tgz

## 2. Check the login

    hosti whoami

This prints the catalog's URL, the push token's name and its scopes. It never
prints the token. If it works, go to step 3.

If it fails, connect to the catalog. You need the catalog's URL. If you do not
know it, ask the owner and stop until you have it. Do not guess one.

    hosti login <catalog URL>

The command prints a link and a short code, each on its own line. Then it
waits for the owner, for up to ten minutes. Tell the owner at once:

- open the link in the browser where they use the catalog
- check that the page shows the same code
- approve

Your shell may show nothing until a command ends. If so, run the login in the
background and read its output while it waits:

    hosti login <catalog URL> > /tmp/hosti-login.log 2>&1 &
    cat /tmp/hosti-login.log

When the owner approves, the command saves the login and prints the token's
name and scopes. If the owner denies it, or it runs out of time, it exits 1
and says so. Ask the owner before you try again.

A token can publish and share. It can delete only if you ran
`hosti login --allow-delete` and the owner ticked delete on the page. Ask for
delete only when the owner wants you to delete bundles.

Never print the token. Never read it out of the config file, and never put it
in a file, a script, a command or a commit message. If HOSTI_URL or HOSTI_TOKEN
is set in the environment, it wins over the saved login.

## 3. Check the folder before you push

index.html must sit at the root of the folder you push, not one directory
down. A folder with exactly one root .html file and no index.html has that file
stored as index.html, which is how a single-page bundle arrives.

Get this wrong and the push is refused with:

    No index.html at the root of the pushed tree. Found: docs/, notes.txt

Read the "Found:" list. It names what was at the root, which is usually one
directory you should have pushed instead.

## 4. Pick a slug

Lowercase letters, digits and dashes, 1 to 64 characters. It is the last part
of the URL, so make it read like the thing: garmin-q3, sleep-brief,
squad-2026.

A slug may already hold a bundle. Pushing to it again is not an error: it adds
the next revision, and that revision becomes the one people see at the same
link. So look first:

    hosti ls

If the slug is taken, tell the owner you are about to replace what is live
there, and say what is there now. Do not silently overwrite a bundle somebody
is reading.

## 5. Push

    hosti push ./out --slug squad-2026 --title "Squad 2026"

--title sets the name the owner reads in the catalog. Without it the bundle is
named after its slug. --collection reports puts the bundle in a named
collection. Both are optional, and a later push cannot clear them.

The push warns about links written from the root of the domain, like
/assets/x.css. Those break once the bundle is served under its own path. Links
inside a bundle must be relative: assets/x.css or ../assets/x.css. Fix what it
names, or tell the owner which files will break and let them decide. Do not
rewrite their files without saying so. --allow-absolute skips the check.

The push prints the revision and the sharing state. A new bundle arrives
private, and the output ends with its admin page. Give the owner that link
exactly as printed. It is where they preview the bundle, and it needs their
own login, so it is not a link they can pass on.

## 6. Share only when asked

A push never changes who can open a bundle. Every bundle lands private and
stays private until somebody says otherwise. Ask first.

Open it to anyone holding the link:

    hosti share squad-2026 --mode link

Put it behind a pin the owner gave you:

    hosti share squad-2026 --mode pin --pin <the owner's digits>

Shut it again:

    hosti share squad-2026 --mode private

Each prints the state and, unless it is private, the share URL. Give the owner
that URL.

A pin is four to eight digits, and only the owner picks them.
Never invent a pin. Never repeat the digits back in your reply. The CLI does
not print them.

## 7. Rotate only when asked

    hosti rotate squad-2026

This gives the bundle a new share URL. The old one stops working for everyone
who holds it, and you cannot know who that is. Rotate only when the owner asks
for it. Then give them the new URL.

## 8. Open

    hosti open squad-2026

The last line is the link to hand over: the share URL, or the owner's admin
page while the bundle is private. --open also opens it in a browser.

## 9. Delete only with scope and word

Delete a bundle only when both are true:

- `hosti whoami` lists the delete scope
- the owner asked you to delete that bundle

A delete takes the files and every revision with it.

    hosti rm squad-2026 --yes

If the token lacks the scope, the command exits 1 and its last line says how
the owner can grant it. Tell the owner. Do not ask for a new login on your own.

## 10. When a command fails

Every command prints the server's reason on its last line and exits non-zero.
Read that line before you do anything else.

- "A valid push token is required": the token is gone or revoked. Run step 2
  again.
- "lacks the ... scope": the token cannot do this. Tell the owner.
- "Cannot reach": the catalog is down or the URL is wrong. Tell the owner.
