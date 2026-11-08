const LEVELS = ["patch", "minor", "major"] as const;

type Level = (typeof LEVELS)[number];

const ROOT = `${import.meta.dir}/..`;
const PACKAGE = Bun.file(`${ROOT}/package.json`);
const BRANCH = "main";
const REMOTE = "origin";

function fail(message: string): never {
	console.error(`\n❌ ${message}`);
	process.exit(1);
}

function attempt(command: string, ...args: string[]): boolean {
	console.log(`\n$ ${command} ${args.join(" ")}`);

	return Bun.spawnSync([command, ...args], { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] }).exitCode === 0;
}

function run(command: string, ...args: string[]): void {
	//if (!attempt(command, ...args)) {
	fail(`${command} ${args.join(" ")} failed`);
	//}
}

function read(command: string, ...args: string[]): string {
	const result = Bun.spawnSync([command, ...args], { cwd: ROOT });

	if (result.exitCode !== 0) {
		fail(`${command} ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);
	}

	return result.stdout.toString().trim();
}

function bump(version: string, level: Level): string {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

	if (match === null) {
		fail(`package.json version "${version}" is not MAJOR.MINOR.PATCH`);
	}

	const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];

	switch (level) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
	}
}

const args = Bun.argv.slice(2);
const level = args.find((arg) => !arg.startsWith("--")) as Level | undefined;
const dryRun = args.includes("--dry-run");

if (level === undefined || !LEVELS.includes(level)) {
	fail(`Usage: bun run release <${LEVELS.join("|")}> [--dry-run]\n   patch: fixes · minor: features games need not touch · major: breaks the API or the wire (games bump gameVersion)`);
}

const branch = read("git", "branch", "--show-current");

if (branch !== BRANCH) {
	fail(`Releases are made from ${BRANCH}, not ${branch || "a detached HEAD"}`);
}

const changes = read("git", "status", "--porcelain")
	.split("\n")
	.filter((line) => line !== "" && !line.slice(3).startsWith("dist/"));

if (changes.length > 0) {
	fail(`Commit or stash these first, so the release is exactly what is committed:\n${changes.join("\n")}`);
}

run("git", "fetch", REMOTE, BRANCH, "--tags");

const behind = Number(read("git", "rev-list", "--count", `HEAD..${REMOTE}/${BRANCH}`));

if (behind > 0) {
	fail(`${BRANCH} is ${behind} commit(s) behind ${REMOTE}/${BRANCH}: pull first`);
}

const source = await PACKAGE.text();
const current = (JSON.parse(source) as { version: string }).version;
const next = bump(current, level);
const tag = `v${next}`;

if (read("git", "tag", "--list", tag) !== "" || read("git", "ls-remote", "--tags", REMOTE, `refs/tags/${tag}`) !== "") {
	fail(`Tag ${tag} already exists`);
}

console.log(`\n📦 ${current} → ${next} (${level})${dryRun ? " — dry run" : ""}`);

run("bun", "check");
run("bun", "test");

if (dryRun) {
	console.log(`\n✅ Dry run passed. A release would build, commit "Release ${tag}", tag ${tag} and push both to ${REMOTE}.`);
	process.exit(0);
}

run("bun", "run", "build");

const updated = source.replace(/("version"\s*:\s*")[^"]*(")/, `$1${next}$2`);

if (updated === source) {
	fail("Could not find the version field in package.json");
}

await Bun.write(PACKAGE, updated);

if (!attempt("git", "add", "package.json") || !attempt("git", "add", "--all", "dist") || !attempt("git", "commit", "-m", `Release ${tag}`)) {
	Bun.spawnSync(["git", "reset", "-q", "--", "package.json", "dist"], { cwd: ROOT });
	await Bun.write(PACKAGE, source);
	fail(`Nothing was released: package.json is back at ${current}, and dist/ holds the new build, uncommitted`);
}

if (!attempt("git", "tag", "-a", tag, "-m", tag)) {
	fail(`"Release ${tag}" is committed but not tagged. Finish with: git tag -a ${tag} -m ${tag} && git push --atomic ${REMOTE} ${BRANCH} ${tag}`);
}

if (!attempt("git", "push", "--atomic", REMOTE, BRANCH, tag)) {
	fail(`${tag} is committed and tagged here, but the push failed. Finish with: git push --atomic ${REMOTE} ${BRANCH} ${tag}`);
}

console.log(`\n✅ Released ${tag}. In a game: bun add github:nasselk/BinaryPack#${tag}`);
