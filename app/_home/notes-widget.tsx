import { StickyNote } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function NotesWidget() {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Notlarım</CardTitle>
          <CardDescription>Kişisel notlarınızı tek yerde tutun</CardDescription>
        </div>
        <StickyNote className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          Notlar yakında eklenecek
        </div>
      </CardContent>
    </Card>
  );
}
