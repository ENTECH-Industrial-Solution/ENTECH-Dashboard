"use client";

import { useActionState, useEffect, useState } from "react";

import { Reveal } from "@/components/motion";
import { PictureField } from "@/components/picture-field";
import { Alert, SubmitButton } from "@/components/ui";
import { useTranslations } from "@/lib/i18n/client";
import { setOwnPhotoAction } from "@/server/actions/profile";
import { idleState } from "@/server/actions/types";

/**
 * Changing your own picture, on your own page. Rendered only there; whose
 * picture it is comes from the session in the action, never from this form.
 */
export function ProfilePhotoForm({ current }: { current: string | null }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(setOwnPhotoAction, idleState);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="space-y-2 pt-2">
        {state.status === "success" && state.message && (
          <Alert tone="success">{state.message}</Alert>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          {t("profile.photoChange")}
        </button>
      </div>
    );
  }

  return (
    <Reveal className="pt-2">
      <form action={action} className="space-y-3">
        <PictureField
          id="profile-photo"
          label={t("profile.photo")}
          current={current}
          error={state.status === "error" ? (state.fieldErrors?.image ?? state.message) : undefined}
          round
        />
        <div className="flex gap-2">
          <SubmitButton className="btn btn-primary">{t("profile.photoSave")}</SubmitButton>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Reveal>
  );
}
