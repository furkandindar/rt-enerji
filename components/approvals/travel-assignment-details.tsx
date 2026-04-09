"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { PendingApproval } from "@/lib/approvals/types";

const transportationLabels: Record<string, string> = {
  COMPANY_VEHICLE: "Şirket Aracı",
  RENTAL_VEHICLE: "Kiralık Araç",
  AIRPLANE: "Uçak",
  OTHER: "Diğer",
};

interface TravelAssignmentDetailsProps {
  approval: PendingApproval;
}

export function TravelAssignmentDetails({ approval }: TravelAssignmentDetailsProps) {
  const travel = approval.request.travel_assignment_request;
  if (!travel) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Şirket</p>
          <p className="text-sm font-semibold">{travel.company?.name || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Ulaşım Aracı</p>
          <p className="text-sm font-semibold">
            {transportationLabels[travel.transportation_type] || "-"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-muted-foreground">Görev Konusu</p>
        <p className="text-sm font-semibold">{travel.assignment_subject}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Görev Şehri</p>
          <p className="text-sm font-semibold">{travel.destination_city}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Görev Kurumu</p>
          <p className="text-sm font-semibold">{travel.destination_institution}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Tahmini Çıkış</p>
          <p className="text-sm font-semibold">
            {format(new Date(travel.estimated_departure_at), "d MMM yyyy HH:mm", { locale: tr })}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Tahmini Dönüş</p>
          <p className="text-sm font-semibold">
            {format(new Date(travel.estimated_return_at), "d MMM yyyy HH:mm", { locale: tr })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Ulaşım Bedeli</p>
          <p className="text-sm font-semibold">
            {travel.transportation_cost.toLocaleString('tr-TR')} TL
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Konaklama</p>
          <p className="text-sm font-semibold">
            {travel.accommodation_needed
              ? `Var - ${travel.accommodation_cost.toLocaleString('tr-TR')} TL`
              : "Yok"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-muted-foreground">Avans Talebi</p>
        <p className="text-sm font-semibold">
          {travel.advance_requested ? "Var" : "Yok"}
        </p>
      </div>

      {travel.actual_departure_at && (
        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Gerçekleşen Gidiş</p>
            <p className="text-sm font-semibold">
              {format(new Date(travel.actual_departure_at), "d MMM yyyy HH:mm", { locale: tr })}
            </p>
          </div>
          {travel.actual_return_at && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Gerçekleşen Dönüş</p>
              <p className="text-sm font-semibold">
                {format(new Date(travel.actual_return_at), "d MMM yyyy HH:mm", { locale: tr })}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
