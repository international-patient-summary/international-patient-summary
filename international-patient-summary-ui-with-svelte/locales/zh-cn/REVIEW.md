# zh-CN translation review

The Simplified Chinese (zh-CN) strings in `messages.yaml` are machine-drafted.
A clinician fluent in Simplified Chinese, ideally one who knows mainland hospital
information systems (HIS/EMR), must review them before release.

Terms the drafter is least sure of:

| Key                                    | Chinese             | English                       |
| -------------------------------------- | ------------------- | ----------------------------- |
| `sections.advanceDirectives.title`     | 预立医疗指示        | Advance directives            |
| `sections.patientStory.title`          | 患者自述            | Patient story                 |
| `sections.procedures.title`            | 手术操作史          | History of procedures         |
| `fields.criticality`                   | 危急程度            | Criticality                   |
| `fields.strength`                      | 规格                | Strength                      |
| `fields.condition`                     | 疾病/问题           | Condition                     |
| `fields.findings`                      | 所见                | Findings                      |
| `status.relapse` / `status.recurrence` | 再发 / 复发         | Relapse / Recurrence          |
| `status.active`                        | 活动                | Active (clinical status)      |
| `interpretation.I`                     | 中介                | Intermediate (susceptibility) |
| `interpretation.HU` / `LU`             | 显著偏高 / 显著偏低 | Significantly high / low      |
| `emptyReason.withheld`                 | 信息已保留          | Information withheld          |
| `document.custodian`                   | 保管机构            | Custodian                     |
| `confidentiality.N` / `M`              | 一般 / 中等         | Normal / Moderate             |

Also check: `format.frequency` word order (每 {$periodLabel} {$frequency} 次),
`format.age.years` using 岁 rather than 年, and `fields.performer` (接种者),
which assumes the label is shown only for immunizations.
