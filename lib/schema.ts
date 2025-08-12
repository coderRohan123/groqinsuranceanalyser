import { z } from 'zod';
export const AcordSchemaRelaxed = z
  .object({
    certificate_information: z
      .object({
        certificate_holder: z.string().optional().nullable(),
        certificate_number: z.string().optional().nullable(),
        revision_number: z.string().optional().nullable(),
        issue_date: z.string().optional().nullable(),
      })
      .optional(),
    insurers: z
      .array(
        z.object({
          insurer_letter: z.string().optional().nullable(),
          insurer_name: z.string().optional().nullable(),
          naic_code: z.string().optional().nullable(),
        })
      )
      .optional()
      .default([]),
    policies: z
      .array(
        z.object({
          policy_information: z
            .object({
              policy_type: z.string().optional().nullable(),
              policy_number: z.string().optional().nullable(),
              effective_date: z.string().optional().nullable(),
              expiry_date: z.string().optional().nullable(),
            })
            .optional(),
          insurer_letter: z.string().optional().nullable(),
          coverages: z
            .array(
              z.object({
                limit_type: z.string().optional().nullable(),
                limit_value: z.number().optional().nullable(),
              })
            )
            .optional()
            .default([]),
        })
      )
      .optional()
      .default([]),
    producer_information: z
      .object({
        primary_details: z
          .object({
            full_name: z.string().optional().nullable(),
            email_address: z.string().optional().nullable(),
            doing_business_as: z.string().optional().nullable(),
          })
          .optional(),
        contact_information: z
          .object({
            phone_number: z.string().optional().nullable(),
            fax_number: z.string().optional().nullable(),
            license_number: z.string().optional().nullable(),
          })
          .optional(),
        address_details: z
          .object({
            address_line_1: z.string().optional().nullable(),
            address_line_2: z.string().optional().nullable(),
            address_line_3: z.string().optional().nullable(),
            city: z.string().optional().nullable(),
            state: z.string().optional().nullable(),
            zip_code: z.string().optional().nullable(),
            country: z.string().optional().nullable(),
          })
          .optional(),
      })
      .optional(),
  })
  .nullable();

export type AcordResponseRelaxed = z.infer<typeof AcordSchemaRelaxed> | null;
