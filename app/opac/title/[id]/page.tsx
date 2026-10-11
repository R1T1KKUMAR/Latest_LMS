import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentSession } from "@/lib/auth";
import { getOpacTitleDetails } from "@/services/opac";
import { TitleDetailClient } from "./TitleDetailClient";

export const dynamic = "force-dynamic";

export default async function TitleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bibId = parseInt(id, 10);

  if (Number.isNaN(bibId) || bibId <= 0) {
    return (
      <div className="py-12">
        <EmptyState
          title="Invalid Title Identifier"
          description="The requested bibliographic title identifier is invalid."
          action={{ label: "Back to OPAC Search", href: "/opac" }}
          icon="⚠️"
        />
      </div>
    );
  }

  const titleDetail = await getOpacTitleDetails(bibId);
  if (!titleDetail) {
    return (
      <div className="py-12">
        <EmptyState
          title="Title Not Found"
          description={`Bibliographic title #${bibId} was not found in the library catalogue.`}
          action={{ label: "Browse OPAC Catalogue", href: "/opac" }}
          icon="🔍"
        />
      </div>
    );
  }

  const auth = await getCurrentSession("PATRON");
  const isLoggedInPatron = Boolean(auth && "patron" in auth);
  const csrfToken = auth?.session?.csrfToken ?? "";

  return (
    <TitleDetailClient
      title={titleDetail}
      isLoggedInPatron={isLoggedInPatron}
      csrfToken={csrfToken}
    />
  );
}
