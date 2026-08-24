import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Card, CardContent } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Callout } from "@/components/ui/Callout";
import { AssignSeatButton } from "@/components/empresa/AssignSeatButton";
import { BuyMoreSeatsButton } from "@/components/empresa/BuyMoreSeatsButton";
import { formatDate, localize } from "@/lib/format";

export const metadata: Metadata = { title: "Cupos" };

interface SeatPoolLike {
  id: string;
  offeringTitle: string | Record<string, string>;
  courseId?: string | null;
  programId?: string | null;
  seatsPurchased: number;
  seatsUsed: number;
  expiresAt?: string | null;
}

const MOCK_POOLS: SeatPoolLike[] = [
  { id: "pool1", offeringTitle: "Liderazgo de equipos remotos", courseId: null, seatsPurchased: 50, seatsUsed: 38, expiresAt: "2026-12-31T00:00:00.000Z" },
  { id: "pool2", offeringTitle: "Compliance y protección de datos personales", courseId: null, seatsPurchased: 70, seatsUsed: 46, expiresAt: "2026-09-01T00:00:00.000Z" },
];

export default async function SeatPoolsPage({ params }: { params: { companyId: string } }) {
  const t = await getTranslations("empresa.seats");
  const locale = await getLocale();
  const accessToken = getServerAccessToken();

  const { data: pools, live } = await withFallback(
    () => companyApi.seatPools(params.companyId, accessToken),
    MOCK_POOLS,
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="flex flex-col gap-4">
        {pools.map((pool: SeatPoolLike) => (
          <Card key={pool.id}>
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <p className="font-medium text-ink-900">
                  {typeof pool.offeringTitle === "string" ? pool.offeringTitle : localize(pool.offeringTitle, locale)}
                </p>
                <p className="text-sm text-ash-500">
                  {t("used")}: {pool.seatsUsed} / {t("purchased")}: {pool.seatsPurchased}
                </p>
                <ProgressBar value={(pool.seatsUsed / pool.seatsPurchased) * 100} className="mt-2 max-w-xs" />
                {pool.expiresAt && <p className="mt-1 text-xs text-ash-400">{t("expiresOn", { date: formatDate(pool.expiresAt, locale) })}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <AssignSeatButton companyId={params.companyId} poolId={pool.id} disabled={pool.seatsUsed >= pool.seatsPurchased} />
                <BuyMoreSeatsButton companyId={params.companyId} courseId={pool.courseId} programId={pool.programId} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
