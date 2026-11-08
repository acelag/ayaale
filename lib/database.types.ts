export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      offers: {
        Row: {
          approved_revision_id: string | null;
          archived_at: string | null;
          created_at: string;
          first_published_at: string | null;
          id: string;
          property_id: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_revision_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          first_published_at?: string | null;
          id?: string;
          property_id: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_revision_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          first_published_at?: string | null;
          id?: string;
          property_id?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offers_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_assets: {
        Row: {
          byte_size: number;
          created_at: string;
          created_by: string;
          height: number;
          id: string;
          main_path: string;
          property_id: string;
          thumbnail_path: string;
          width: number;
        };
        Insert: {
          byte_size: number;
          created_at?: string;
          created_by: string;
          height: number;
          id: string;
          main_path: string;
          property_id: string;
          thumbnail_path: string;
          width: number;
        };
        Update: {
          byte_size?: number;
          created_at?: string;
          created_by?: string;
          height?: number;
          id?: string;
          main_path?: string;
          property_id?: string;
          thumbnail_path?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "photo_assets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photo_assets_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_prices: {
        Row: {
          amount: number;
          billing_months: number;
          created_at: string;
          currency: string;
          id: string;
          plan_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          billing_months: number;
          created_at?: string;
          currency?: string;
          id?: string;
          plan_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          billing_months?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          plan_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_prices_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          active_offer_limit: number;
          code: string;
          created_at: string;
          id: string;
          name: string;
          payments_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          active_offer_limit: number;
          code: string;
          created_at?: string;
          id?: string;
          name: string;
          payments_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          active_offer_limit?: number;
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          payments_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          address: string;
          amenities: string[];
          archived_at: string | null;
          created_at: string;
          description: string | null;
          district: string;
          facebook_url: string | null;
          google_maps_url: string | null;
          google_reviews_url: string | null;
          id: string;
          instagram_url: string | null;
          latitude: number | null;
          longitude: number | null;
          name: string;
          primary_category: string;
          property_type: string;
          public_email: string | null;
          public_phone: string | null;
          public_whatsapp: string | null;
          slug: string;
          updated_at: string;
          verification_status: string;
          verified_at: string | null;
          website_url: string | null;
        };
        Insert: {
          address: string;
          amenities?: string[];
          archived_at?: string | null;
          created_at?: string;
          description?: string | null;
          district: string;
          facebook_url?: string | null;
          google_maps_url?: string | null;
          google_reviews_url?: string | null;
          id?: string;
          instagram_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          primary_category: string;
          property_type: string;
          public_email?: string | null;
          public_phone?: string | null;
          public_whatsapp?: string | null;
          slug: string;
          updated_at?: string;
          verification_status?: string;
          verified_at?: string | null;
          website_url?: string | null;
        };
        Update: {
          address?: string;
          amenities?: string[];
          archived_at?: string | null;
          created_at?: string;
          description?: string | null;
          district?: string;
          facebook_url?: string | null;
          google_maps_url?: string | null;
          google_reviews_url?: string | null;
          id?: string;
          instagram_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          primary_category?: string;
          property_type?: string;
          public_email?: string | null;
          public_phone?: string | null;
          public_whatsapp?: string | null;
          slug?: string;
          updated_at?: string;
          verification_status?: string;
          verified_at?: string | null;
          website_url?: string | null;
        };
        Relationships: [];
      };
      property_memberships: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          property_id: string;
          role: string;
          staff_slot: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          property_id: string;
          role: string;
          staff_slot?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          property_id?: string;
          role?: string;
          staff_slot?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "property_memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "property_memberships_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_property_staff_invite: {
        Args: { invite_token: string };
        Returns: string;
      };
      consume_request_budget: {
        Args: { budget_action: string; subject_hash: string };
        Returns: {
          allowed: boolean;
          retry_after: number;
        }[];
      };
      create_property_staff_invite: {
        Args: {
          invited_email: string;
          target_property: string;
          token_digest: string;
        };
        Returns: string;
      };
      decide_offer_review: {
        Args: {
          target_offer: string;
          target_revision: string;
          expected_version: string;
          operation: string;
          decision_message: string;
          checklist: Json;
        };
        Returns: string;
      };
      get_admin_reports: {
        Args: {
          target_report?: string;
          completed?: boolean;
          page_index?: number;
          action_page?: number;
        };
        Returns: Json;
      };
      moderate_report: {
        Args: {
          target_report: string;
          expected_version: string;
          operation: string;
          decision_note: string;
          new_priority: string;
          owner_message: string;
          confirm_visibility: boolean;
        };
        Returns: string;
      };
      get_admin_offer_reviews: {
        Args: {
          target_offer?: string;
          target_revision?: string;
          completed?: boolean;
          page_offset?: number;
        };
        Returns: Json;
      };
      decide_ownership_claim: {
        Args: {
          target_claim: string;
          target_property?: string;
          operation: string;
          decision_note: string;
          evidence: string;
          independently_verified: boolean;
        };
        Returns: string;
      };
      get_admin_ownership_claims: {
        Args: { target_claim?: string; completed?: boolean; page_offset?: number };
        Returns: Json;
      };
      get_my_ownership_claims: { Args: never; Returns: Json };
      decide_property_verification: {
        Args: {
          decision: Json;
          expected_version: string;
          operation: string;
          target_property: string;
        };
        Returns: string;
      };
      get_admin_verifications: {
        Args: { page_offset?: number; queue_filter?: string; target_property?: string };
        Returns: Json;
      };
      get_admin_overview: { Args: never; Returns: Json };
      schedule_admin_newsletter: {
        Args: {
          campaign_id: string;
          expected_version: string;
          send_at: string | null;
          cancel?: boolean;
        };
        Returns: string;
      };
      get_admin_newsletter_metrics: { Args: { campaign_id: string }; Returns: Json };
      claim_newsletter_email: { Args: never; Returns: Json };
      prepare_newsletter_email: {
        Args: {
          delivery_id: string;
          lease: string;
          digest: string;
          unsubscribe_digest: string;
          click_digests: Json;
        };
        Returns: boolean;
      };
      record_newsletter_click: {
        Args: { token_digest: string; record_click?: boolean };
        Returns: string;
      };

      get_admin_newsletter: { Args: { campaign_id?: string; page_index?: number }; Returns: Json };
      search_admin_newsletter_offers: { Args: { search_text?: string }; Returns: Json };
      save_admin_newsletter: {
        Args: {
          campaign_id: string | null;
          expected_version: string;
          newsletter_subject: string;
          newsletter_intro: string;
          offer_ids: string[];
          revision_ids: string[];
        };
        Returns: Json;
      };
      prepare_admin_newsletter_test: {
        Args: { campaign_id: string; expected_version: string; test_id: string };
        Returns: Json;
      };
      finish_admin_newsletter_test: {
        Args: { test_id: string; outcome: string; provider_message: string | null };
        Returns: boolean;
      };
      request_newsletter_signup: {
        Args: {
          subscriber_email: string;
          confirm_digest: string;
          unsubscribe_digest: string;
          subject_hash: string;
          privacy_version: string;
        };
        Returns: Json;
      };
      apply_newsletter_token: {
        Args: { token_purpose: string; token_digest: string };
        Returns: string;
      };
      get_notification_inbox: {
        Args: { admin_inbox?: boolean; page_index?: number; count_only?: boolean };
        Returns: Json;
      };
      mark_notification_read: {
        Args: { notification_id: string; admin_inbox?: boolean };
        Returns: boolean;
      };
      claim_transactional_email: { Args: never; Returns: Json };
      prepare_transactional_email: {
        Args: { delivery_id: string; lease: string; digest: string };
        Returns: boolean;
      };
      finish_transactional_email: {
        Args: {
          delivery_id: string;
          lease: string;
          outcome: string;
          provider_id: string | null;
          error_code: string | null;
        };
        Returns: boolean;
      };
      record_transactional_email_event: {
        Args: {
          delivery_id: string;
          provider_id: string;
          event_status: string;
          occurred_at: string;
        };
        Returns: boolean;
      };
      run_offer_lifecycle: { Args: never; Returns: Json };
      queue_partner_lifecycle_emails: { Args: never; Returns: Json };
      queue_offer_and_inactivity_reminders: { Args: never; Returns: Json };
      get_admin_platform_analytics: { Args: { trend_days?: number }; Returns: Json };
      get_admin_content_health: {
        Args: { expiring_page?: number; inactive_page?: number };
        Returns: Json;
      };
      get_offer_wizard: {
        Args: {
          draft_id?: string;
          draft_page?: number;
          target_property: string;
        };
        Returns: Json;
      };
      get_partner_offers: {
        Args: { list_page?: number; target_property: string };
        Returns: Json;
      };
      get_partner_overview: { Args: never; Returns: Json };
      get_property_analytics: {
        Args: { offer_page?: number; target_property: string; trend_days?: number };
        Returns: Json;
      };
      get_property_editor: { Args: { target_property: string }; Returns: Json };
      get_property_offer_capacity: {
        Args: { target_property: string };
        Returns: Json;
      };
      get_property_subscription: {
        Args: { target_property: string };
        Returns: Json;
      };
      get_property_team: { Args: { target_property: string }; Returns: Json };
      get_public_offer_cover_path: {
        Args: { offer_slug: string };
        Returns: string;
      };
      get_public_offer_details: { Args: { offer_slug: string }; Returns: Json };
      get_public_offer_page: { Args: { offer_slug: string }; Returns: Json };
      get_public_property_photo_path: {
        Args: { photo_position: number; property_slug: string };
        Returns: string;
      };
      get_public_property_profile: {
        Args: { property_slug: string };
        Returns: Json;
      };
      has_platform_admin_access: { Args: never; Returns: boolean };
      list_public_sitemap_paths: {
        Args: { after_path?: string | null; page_size?: number };
        Returns: { path: string }[];
      };
      list_discovery_offers: {
        Args: {
          category_filter?: string;
          continuation?: Json;
          query_text?: string;
        };
        Returns: Json;
      };
      list_discovery_offers_filtered: {
        Args: {
          category_filter: string;
          continuation: Json;
          filters: Json;
          query_text: string;
        };
        Returns: Json;
      };
      manage_partner_offer: {
        Args: {
          expected_version?: string;
          item_id: string;
          new_draft_id?: string;
          operation: string;
          target_property: string;
        };
        Returns: string;
      };
      manage_property_staff: {
        Args: { entry_id: string; operation: string; target_property: string };
        Returns: string;
      };
      record_auth_audit: {
        Args: { event_name: string; verified_actor?: string };
        Returns: undefined;
      };
      record_offer_contact_click: {
        Args: {
          contact_channel: string;
          event_token: string;
          offer_slug: string;
        };
        Returns: string;
      };
      record_offer_view: { Args: { event_token: string; offer_slug: string }; Returns: string };
      record_offer_view_attributed: {
        Args: { event_token: string; offer_slug: string; traffic_source: string };
        Returns: string;
      };
      register_partner_property: {
        Args: { details: Json; registration_id: string };
        Returns: string;
      };
      save_offer_wizard: {
        Args: {
          content: Json;
          draft_id: string;
          expected_version: number;
          submit_for_review: boolean;
          target_property: string;
        };
        Returns: string;
      };
      submit_property_profile: {
        Args: {
          changes: Json;
          expected_version: string;
          target_property: string;
        };
        Returns: string;
      };
      submit_public_issue_report: {
        Args: {
          contact_email?: string;
          report_comment?: string;
          report_id: string;
          report_reason: string;
          target_kind: string;
          target_slug: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
