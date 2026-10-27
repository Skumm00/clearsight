import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-light">That page doesn&apos;t exist.</h1>
      <Link href="/" className="inline-flex h-12 items-center rounded-sm bg-accent px-8 text-accent-ink hover:brightness-110">
        Back to home
      </Link>
    </div>
  );
}
