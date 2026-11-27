import { Logo } from "@/components/Logo";

// Shared footer from Figma (#290): logo and copyright. The Figma's Terms and Privacy links come
// back with their pages (#400): until those exist, they only led to the 404 page.
export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-7 sm:flex-row sm:items-center sm:justify-between md:px-10">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="type-body-sm text-muted-foreground">© {new Date().getFullYear()} NFTOKENPASS. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
