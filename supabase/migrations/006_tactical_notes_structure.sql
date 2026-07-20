-- Tactische aandachtspunten opsplitsen naar team-/linieniveau x 4 KNVB-momenten
-- (aanvallen, verdedigen, omschakelen naar aanval, omschakelen naar verdediging).
-- Bestaande vrije tekst (indien aanwezig) wordt bewaard onder team > aanvallen.

alter table match_preparations
  alter column tactical_notes type jsonb
  using (
    case
      when tactical_notes is null or tactical_notes = '' then '{}'::jsonb
      else jsonb_build_object(
        'team', jsonb_build_object('attacking', tactical_notes)
      )
    end
  );

alter table match_preparations alter column tactical_notes set default '{}'::jsonb;
