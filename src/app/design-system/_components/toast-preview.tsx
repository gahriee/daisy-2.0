"use client";

import { Button } from "@/components/ui/button";
import { notifySaved, toast } from "@/components/ui/toaster";

export function ToastPreview() {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => notifySaved("Changes saved online.", "success")}
      >
        Preview saved toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          notifySaved("Saved on this device (waiting to go online).", "info")
        }
      >
        Preview local draft toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          notifySaved("Saved in Needs attention: record changed.", "warning")
        }
      >
        Preview attention toast
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => toast.error("Could not complete action right now.")}
      >
        Preview error toast
      </Button>
    </div>
  );
}
