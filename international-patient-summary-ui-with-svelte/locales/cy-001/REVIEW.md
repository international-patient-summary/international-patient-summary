# Welsh (cy-001) translation review

The Welsh strings in `messages.yaml` are machine-drafted. Before release, a fluent
Welsh-speaking clinician must review them, ideally against NHS Wales / GIG Cymru
patient-facing terminology.

Please check in particular:

- Mutations after digits in plural messages (for example `2 flynedd`, `3 chofnod`,
  `2 ddiwrnod`), and the `{$count} o …` plural construction used for the
  "other" form.
- The gender of `munud` (drafted as feminine: `1 funud`, `2 funud`).
- Whether `format.age.years` should use the age form (`… blwydd oed` / `… oed`)
  rather than `blwyddyn` / `blynedd`.
- FHIR resource names `Bundle` and `Composition` are left in English.

## Terms I am least sure of

| Key                                | Welsh (draft)                          | English                                 |
| ---------------------------------- | -------------------------------------- | --------------------------------------- |
| `sections.procedures.title`        | Hanes triniaethau                      | History of procedures                   |
| `sections.functionalStatus.title`  | Statws gweithredol                     | Functional status                       |
| `sections.advanceDirectives.title` | Penderfyniadau ymlaen llaw             | Advance directives                      |
| `fields.criticality`               | Critigolrwydd                          | Criticality                             |
| `fields.abatement`                 | Wedi gwella                            | Resolved (abatement)                    |
| `fields.dosage`                    | Dosio                                  | Dosage                                  |
| `status.relapse`                   | Atglafychiad                           | Relapse                                 |
| `status.remission`                 | Wedi cilio                             | Remission                               |
| `status.recurrence`                | Wedi digwydd eto                       | Recurrence                              |
| `interpretation.S`                 | Sensitif                               | Susceptible                             |
| `interpretation.HU`                | Uchel sylweddol                        | Significantly high                      |
| `document.custodian`               | Ceidwad                                | Custodian                               |
| `values.yes` / `values.no`         | Ie / Na                                | Yes / No                                |
| `format.frequency`                 | {$frequency} gwaith bob {$periodLabel} | {$frequency} times every {$periodLabel} |

## Tour strings (added 2026-11-15)

The `tour.*` keys and `header.tour` are machine-drafted too (tasks P9-T6).
Please check the register of the sign-in wording, and that the tour is clearly
described as a demonstration with no server. `example@example.com` and the
password `example` must stay as they are.
