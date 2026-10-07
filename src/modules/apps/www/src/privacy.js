// Ported from apps/www/src/privacy.ts; TypeScript types erased; native runtime imports.
import { DISCORD_INVITE, ISSUES_URL, PRIVACY_EMAIL, SOURCE_REPO } from "./links.js";
const EFFECTIVE_DATE = "26 July 2026";
const STYLES = `
:root {
	color-scheme: dark light;
	--bg: #14100c;
	--surface: #1e1813;
	--line: #33291f;
	--text: #f5ede1;
	--muted: #a8927c;
	--accent: #fe7101;
}
@media (prefers-color-scheme: light) {
	:root {
		--bg: #f7f5f2;
		--surface: #ffffff;
		--line: #e2ddd6;
		--text: #201a14;
		--muted: #736656;
		--accent: #e05f00;
	}
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font-family: 'IBM Plex Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
	font-size: 1rem;
	line-height: 1.65;
	-webkit-font-smoothing: antialiased;
}
a { color: var(--accent); }
.nav {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 16px;
	max-width: 760px;
	margin: 0 auto;
	padding: 20px;
	border-bottom: 1px solid var(--line);
}
.brand {
	font-family: Archivo, system-ui, sans-serif;
	font-weight: 800;
	font-size: 1.2rem;
	letter-spacing: -0.015em;
	color: var(--text);
	text-decoration: none;
}
.nav a.back { color: var(--muted); text-decoration: none; font-size: 0.95rem; }
.nav a.back:hover { color: var(--text); }
main { max-width: 760px; margin: 0 auto; padding: 40px 20px 8px; }
h1 {
	font-family: Archivo, system-ui, sans-serif;
	font-weight: 800;
	font-size: clamp(1.9rem, 4vw, 2.6rem);
	line-height: 1.1;
	letter-spacing: -0.03em;
	margin: 0 0 8px;
}
h2 {
	font-family: Archivo, system-ui, sans-serif;
	font-weight: 700;
	font-size: 1.3rem;
	letter-spacing: -0.02em;
	margin: 40px 0 10px;
}
h3 { font-size: 1rem; font-weight: 600; margin: 24px 0 6px; }
p, li { max-width: 68ch; }
.updated { color: var(--muted); font-size: 0.9rem; margin: 0 0 8px; }
.lede { font-size: 1.075rem; }
ul { padding-left: 22px; }
li { margin-bottom: 8px; }
li > strong { font-weight: 600; }
.callout {
	background: var(--surface);
	border: 1px solid var(--line);
	border-left: 3px solid var(--accent);
	border-radius: 10px;
	padding: 18px 22px;
	margin: 20px 0;
}
.callout p:first-child { margin-top: 0; }
.callout p:last-child { margin-bottom: 0; }
footer {
	max-width: 760px;
	margin: 0 auto;
	padding: 24px 20px 48px;
	border-top: 1px solid var(--line);
	color: var(--muted);
	font-size: 0.875rem;
}
footer a { color: var(--muted); }
`;
function contactList() {
  const email = PRIVACY_EMAIL ? `<li><strong>Email</strong> \u2014 <a href="mailto:${PRIVACY_EMAIL}">${PRIVACY_EMAIL}</a>.</li>` : "";
  return `<ul>
	${email}
	<li><strong>Discord</strong> \u2014 ask a moderator in <a href="${DISCORD_INVITE}" target="_blank" rel="noreferrer">our Discord server</a>.</li>
	<li><strong>GitHub</strong> \u2014 <a href="${ISSUES_URL}" target="_blank" rel="noreferrer">open an issue</a> on the project repo. Don't post personal details in a public issue; your username is enough for us to find you.</li>
</ul>`;
}
function privacyPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Privacy Policy \u2014 RecFlare</title>
<meta name="description" content="What RecFlare collects, why, and how to have your data deleted." />
<meta name="theme-color" content="#14100c" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${STYLES}</style>
</head>
<body>
<header class="nav">
	<a class="brand" href="/">RecFlare</a>
	<a class="back" href="/">Back to the site</a>
</header>
<main>
	<h1>Privacy Policy</h1>
	<p class="updated">Last updated ${EFFECTIVE_DATE}</p>

	<p class="lede">
		RecFlare is a free, open source, fan-run game server. It is not a business, it sells
		nothing, and it has no interest in your data beyond making the game work. This page
		explains exactly what we store, why we store it, and how to make us delete it.
	</p>

	<div class="callout">
		<p>
			<strong>The short version.</strong> We store your account, the things you make in
			game (photos, rooms, messages, inventory), and the technical details needed to log
			you in and keep the server from being abused. We don't sell anything, we run no
			advertising, and we've integrated no third-party analytics or tracking. Ask us and
			we'll delete your account and its data, free, wherever you live.
		</p>
	</div>

	<h2>Who runs this</h2>
	<p>
		RecFlare is maintained by a volunteer community, and its source code is public at
		<a href="${SOURCE_REPO}" target="_blank" rel="noreferrer">github.com/djdevin/recflare</a>.
		This policy covers the RecFlare game servers and this website. It is a fan project, not
		affiliated with, endorsed by, or connected to Rec Room Inc.
	</p>
	<p>
		Because the server code is open source, anyone can read exactly how the data described
		below is handled, and anyone can run their own separate copy of RecFlare. This policy
		applies only to the servers we operate. If you play on someone else's instance, their
		operator is responsible for your data, not us.
	</p>

	<h2>What we collect</h2>
	<p>
		Almost all of it is data you create by playing. We do not buy data about you from
		anyone, and we do not combine what's here with data from other services.
	</p>

	<h3>Your account</h3>
	<ul>
		<li>Your username, display name, profile picture, pronoun and identity settings, bio, and the date the account was created.</li>
		<li>An email address and phone number <em>only if you choose to add them</em>. Neither is required to play, and neither is used for marketing.</li>
	</ul>

	<h3>How you sign in</h3>
	<p>
		You can sign in with an account from the platform you play on, or with a password.
		Whichever you use, we store the minimum needed to recognise you next time.
	</p>
	<ul>
		<li><strong>Steam.</strong> Your SteamID64, so the account can be matched to the right player. Steam signs the login ticket the game sends us, and we check that signature on our own servers \u2014 nothing about you is sent to Steam to do it.</li>
		<li><strong>Meta.</strong> The user ID Meta issues for you <em>for this app</em>, and the display name attached to it. This is an app-scoped ID: it identifies you within RecFlare and is not your Meta account identity anywhere else. To confirm a sign-in is genuine, and that the account is entitled to the app, we send the token your headset gives us to Meta for verification \u2014 so Meta learns that a sign-in to RecFlare happened. We don't receive your Meta email address, friends list or profile beyond the ID and display name, and we don't ask Meta for them.</li>
		<li><strong>A password on this website.</strong> Stored only as a salted PBKDF2 hash. We never store the password itself and cannot read it.</li>
	</ul>
	<p>
		Linking a platform account is how you log in \u2014 we don't use it to look you up on that
		platform, post anything there, or match you to advertising.
	</p>

	<h3>Device and technical data</h3>
	<ul>
		<li>The time of your most recent sign-in.</li>
		<li>A device identifier the game client generates for each installation, and the kind of device it is \u2014 a PC or a headset, for example.</li>
		<li>The IP address the account was created from, and the IP address of your most recent sign-in.</li>
		<li>Session tokens. Refresh tokens are stored only as a one-way hash and are single-use.</li>
		<li>Ordinary server request logs, held by our hosting provider, which include IP addresses, timestamps and the requests made.</li>
	</ul>

	<h3>What you make and do in game</h3>
	<ul>
		<li>Photos you take in game, and their details: who took them, the room they were taken in, and any players tagged.</li>
		<li>Rooms and subrooms you create, inventions you build, and clubs you own or join.</li>
		<li>Chat messages you send and the conversations they belong to, so they can be delivered and read later.</li>
		<li>Your relationships with other players \u2014 friends, invites and blocks \u2014 and your interactions with rooms, such as favourites and cheers.</li>
		<li>Your in-game economy: token balance, inventory, outfits and gifts received.</li>
		<li>Your presence \u2014 which room instance you are currently in \u2014 so friends can find you and join. Presence records expire automatically on their own.</li>
		<li>Your player settings and preferences.</li>
	</ul>

	<h2>Why we use it</h2>
	<ul>
		<li><strong>To run the game.</strong> Nearly everything above exists so the world can be reassembled the next time you log in \u2014 your avatar, your rooms, your inventory, your photos, your conversations.</li>
		<li><strong>To sign you in.</strong> Your platform identity, password hash and session tokens are what prove an account is yours and stop anyone else using it.</li>
		<li><strong>To let players find each other.</strong> Presence, friend lists and public feeds \u2014 including the photo slideshow on this website's front page, which shows public in-game photos along with the username of the player who took each one.</li>
		<li><strong>To keep the server usable.</strong> IP addresses, device identifiers and logs are used to investigate abuse, ban evasion and bugs, and to limit how many accounts can be created from one place. This is the only reason we keep them.</li>
		<li><strong>To contact you, if you asked us to.</strong> An email address you add is used for account recovery and account notices, nothing else.</li>
	</ul>
	<p>
		We do not use your data for advertising or profiling, we do not sell or rent it, and we
		do not share it for anyone else's marketing. There are no advertising SDKs, analytics
		SDKs or tracking pixels in the game client or on this website.
	</p>

	<h2>Who else sees it</h2>
	<ul>
		<li><strong>Other players.</strong> Some of what you create is public by design: your username, display name, profile picture, bio, the rooms you publish, photos you make public, and messages you send to the people you send them to.</li>
		<li><strong>Our hosting provider.</strong> The servers, databases, file storage and logs run on Cloudflare, which processes this data on our behalf in order to host the service.</li>
		<li><strong>Meta, when you sign in with a Meta account.</strong> We send Meta the sign-in token from your headset so it can be verified, which tells Meta that a RecFlare sign-in took place. That exchange is governed by Meta's own privacy policy. Signing in with Steam involves no such call.</li>
		<li><strong>Nobody else</strong> \u2014 except where we're required by law to disclose something, or where it's necessary to investigate a serious safety issue or abuse of the service.</li>
	</ul>
	<p>
		Our community Discord server and our GitHub repository are run by Discord and GitHub
		under their own privacy policies. Anything you post there is covered by their terms,
		not this one.
	</p>

	<h2>Cookies</h2>
	<p>
		This website sets one cookie, <code>rf_token</code>, which holds your sign-in session.
		It is strictly necessary to stay signed in, it is not readable by page scripts, and it
		is cleared when you sign out. We set no advertising or analytics cookies. The game
		client itself uses no cookies.
	</p>

	<h2>How long we keep it</h2>
	<p>
		Account and game data is kept for as long as your account exists, so your progress is
		there when you come back. Presence records expire within minutes. Session tokens expire
		on their own schedule. Server logs are retained for a short period and then age out
		automatically. When you ask us to delete your account, we delete it as described below.
	</p>

	<h2>Deleting your data</h2>
	<p>
		<strong>You can ask us to delete your account and the data we hold about you at any
		time, from anywhere in the world.</strong> There is no charge for this, and you don't
		need to give a reason. Contact us by any of these routes:
	</p>
	${contactList()}
	<p>
		Tell us your RecFlare username, and be ready to prove the account is yours \u2014 normally
		by signing in to it, or by sending the request from the email address on the account.
		We ask because otherwise anyone could delete anyone else's account. We'll confirm when
		it's done, and we aim to complete every request within 30 days.
	</p>
	<p>Deleting your account removes:</p>
	<ul>
		<li>Your account record \u2014 username, display name, profile picture, bio, email, phone number and password hash.</li>
		<li>The link between the account and your Steam or Meta identity, and the stored IP addresses and device identifier.</li>
		<li>Your session and refresh tokens, ending any active sign-in.</li>
		<li>Your photos, rooms, inventions, inventory, settings and presence.</li>
	</ul>
	<p>
		Two honest limits. Messages you sent live in shared conversations, so copies already
		delivered to other players may remain in their message history, no longer attached to
		an account. And routine server logs and backups age out on their own timers rather than
		being edited, so a record of a request may persist for a short period after deletion.
		Beyond those, if there's ever a reason we can't complete a deletion request, we'll tell
		you what it is.
	</p>
	<p>
		You can also change or correct most of your details yourself, either in game or on the
		<a href="/account">account page</a> of this website, and you can ask us for a copy of
		the data we hold about you using the same contact routes above.
	</p>

	<h2>Security</h2>
	<p>
		All traffic between the game client, this website and our servers is encrypted in
		transit. Passwords are stored only as salted hashes and refresh tokens only as one-way
		hashes, so a copy of our database would not reveal either. Access to the production
		data is limited to the maintainers who operate the service. No system is perfectly
		secure, and we won't pretend otherwise \u2014 but this is a hobby server, so please don't
		reuse a password here that you use anywhere important.
	</p>

	<h2>Children</h2>
	<p>
		RecFlare is not directed at children under 13, and we don't knowingly collect data from
		them. If you believe a child under 13 has created an account, contact us using any of
		the routes above and we will delete the account and its data.
	</p>

	<h2>Changes to this policy</h2>
	<p>
		If this policy changes we'll update the date at the top of this page, and the change
		will be visible in the project's public commit history. Significant changes will be
		announced in our Discord server.
	</p>

	<h2>Contact</h2>
	<p>Questions about this policy, or about any data we hold:</p>
	${contactList()}
</main>
<footer>
	<a href="/">RecFlare</a> \u2014 a fan project, not affiliated with Rec Room Inc.
</footer>
</body>
</html>`;
}
export {
  privacyPage
};
