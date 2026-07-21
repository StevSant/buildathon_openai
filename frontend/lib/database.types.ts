export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_rules: {
        Row: {
          center: unknown
          channel: string
          created_at: string
          enabled: boolean
          id: string
          min_severity: number
          radius_meters: number
          user_id: string
        }
        Insert: {
          center?: unknown
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          min_severity?: number
          radius_meters?: number
          user_id: string
        }
        Update: {
          center?: unknown
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          min_severity?: number
          radius_meters?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          opt_in_status: string
          owner_id: string
          phone_e164: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          opt_in_status?: string
          owner_id: string
          phone_e164: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          opt_in_status?: string
          owner_id?: string
          phone_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          incident_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          incident_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          incident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_comments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_confirmations: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          kind?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_confirmations_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_confirmations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          category: string
          confirmations: number
          created_at: string
          description: string | null
          expires_at: string
          id: string
          location: unknown
          photo_path: string | null
          reporter_id: string | null
          severity: number
          status: string
          title: string
        }
        Insert: {
          category: string
          confirmations?: number
          created_at?: string
          description?: string | null
          expires_at?: string
          id?: string
          location: unknown
          photo_path?: string | null
          reporter_id?: string | null
          severity?: number
          status?: string
          title: string
        }
        Update: {
          category?: string
          confirmations?: number
          created_at?: string
          description?: string | null
          expires_at?: string
          id?: string
          location?: unknown
          photo_path?: string | null
          reporter_id?: string | null
          severity?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cedula_hash: string | null
          created_at: string
          display_name: string | null
          id: string
          trust_score: number
          verification_method: string | null
          verified: boolean
        }
        Insert: {
          cedula_hash?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          trust_score?: number
          verification_method?: string | null
          verified?: boolean
        }
        Update: {
          cedula_hash?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          trust_score?: number
          verification_method?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      whatsapp_config: {
        Row: {
          created_at: string
          enabled: boolean
          phone_e164: string | null
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          phone_e164?: string | null
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          enabled?: boolean
          phone_e164?: string | null
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_dispatch_log: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          incident_id: string | null
          status: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          incident_id?: string | null
          status?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          incident_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_dispatch_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "emergency_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_dispatch_log_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_incident_comment: {
        Args: { comment_body: string; target_id: string }
        Returns: {
          author_verified: boolean
          body: string
          created_at: string
          id: string
        }[]
      }
      confirm_incident: {
        Args: {
          confirm_threshold?: number
          dispute_threshold?: number
          kind?: string
          target_id: string
        }
        Returns: {
          confirmations: number
          id: string
          status: string
        }[]
      }
      get_alert_matches: {
        Args: { target_incident: string }
        Returns: {
          contact_id: string
          phone_e164: string
          user_id: string
        }[]
      }
      get_incident_comments: {
        Args: { target_id: string }
        Returns: {
          author_verified: boolean
          body: string
          created_at: string
          id: string
        }[]
      }
      get_incident_details: {
        Args: { target_id: string }
        Returns: {
          category: string
          confirmations: number
          created_at: string
          description: string
          disputes: number
          id: string
          lat: number
          lng: number
          photo_path: string | null
          reporter_verified: boolean
          severity: number
          status: string
          title: string
        }[]
      }
      get_nearby_incidents: {
        Args: {
          filter_category?: string
          radius_meters?: number
          user_lat: number
          user_long: number
        }
        Returns: {
          category: string
          confirmations: number
          created_at: string
          description: string
          distance_meters: number
          id: string
          lat: number
          lng: number
          severity: number
          status: string
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
