/* eslint-disable */
// Generado desde el schema de Supabase. NO editar a mano.
// Regenerar con: pnpm db:types
//
// Los tipos del dominio viven en index.ts y son los que consume la aplicación.
// Estos describen la base y sólo los usa el adapter.

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
      affinity_runs: {
        Row: {
          computed_at: string | null
          pairs_count: number
          products_count: number
          started_at: string
          store_id: string
          tenant_id: string
        }
        Insert: {
          computed_at?: string | null
          pairs_count?: number
          products_count?: number
          started_at?: string
          store_id: string
          tenant_id: string
        }
        Update: {
          computed_at?: string | null
          pairs_count?: number
          products_count?: number
          started_at?: string
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affinity_runs_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "affinity_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credentials: {
        Row: {
          ciphertext: string
          created_at: string
          last4: string
          model: string
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          last4: string
          model: string
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          last4?: string
          model?: string
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credentials_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          llamadas: number
          mes: string
          store_id: string
          tenant_id: string
          tipo: string
          tokens: number
          updated_at: string
        }
        Insert: {
          llamadas?: number
          mes: string
          store_id: string
          tenant_id: string
          tipo: string
          tokens?: number
          updated_at?: string
        }
        Update: {
          llamadas?: number
          mes?: string
          store_id?: string
          tenant_id?: string
          tipo?: string
          tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ai_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_definitions: {
        Row: {
          category_id: string | null
          created_at: string
          filterable: boolean
          id: string
          label: string
          name: string
          position: number
          searchable: boolean
          sortable: boolean
          store_id: string
          tenant_id: string
          updated_at: string
          visible_card: boolean
          visible_pdp: boolean
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          filterable?: boolean
          id?: string
          label: string
          name: string
          position?: number
          searchable?: boolean
          sortable?: boolean
          store_id: string
          tenant_id: string
          updated_at?: string
          visible_card?: boolean
          visible_pdp?: boolean
        }
        Update: {
          category_id?: string | null
          created_at?: string
          filterable?: boolean
          id?: string
          label?: string
          name?: string
          position?: number
          searchable?: boolean
          sortable?: boolean
          store_id?: string
          tenant_id?: string
          updated_at?: string
          visible_card?: boolean
          visible_pdp?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "attribute_definitions_category_id_fkey"
            columns: ["category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "attribute_definitions_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "attribute_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          metadata: Json
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          metadata?: Json
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          created_at: string
          cta_label: string | null
          href: string | null
          id: string
          image: Json
          image_mobile: Json | null
          position: number
          published: boolean
          section_id: string | null
          store_id: string
          subtitle: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          href?: string | null
          id?: string
          image: Json
          image_mobile?: Json | null
          position?: number
          published?: boolean
          section_id?: string | null
          store_id: string
          subtitle?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          href?: string | null
          id?: string
          image?: Json
          image_mobile?: Json | null
          position?: number
          published?: boolean
          section_id?: string | null
          store_id?: string
          subtitle?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_section_id_fkey"
            columns: ["section_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "home_sections"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "banners_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "banners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image: Json | null
          name: string
          parent_id: string | null
          position: number
          slug: string
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image?: Json | null
          name: string
          parent_id?: string | null
          position?: number
          slug: string
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image?: Json | null
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_products: {
        Row: {
          collection_id: string
          position: number
          product_id: string
          tenant_id: string
        }
        Insert: {
          collection_id: string
          position?: number
          product_id: string
          tenant_id: string
        }
        Update: {
          collection_id?: string
          position?: number
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "collection_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          handle: string
          home_position: number | null
          id: string
          published: boolean
          rules: Json | null
          sort: string | null
          store_id: string
          subtitle: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          handle: string
          home_position?: number | null
          id?: string
          published?: boolean
          rules?: Json | null
          sort?: string | null
          store_id: string
          subtitle?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          handle?: string
          home_position?: number | null
          id?: string
          published?: boolean
          rules?: Json | null
          sort?: string | null
          store_id?: string
          subtitle?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "collections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_accounts: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          store_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          store_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          store_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_customer_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_accounts_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address: Json
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string | null
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address: Json
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label?: string | null
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: Json
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_addresses_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_addresses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_preferences: {
        Row: {
          computed_at: string
          customer_id: string
          prefiere: Json
          store_id: string
          tenant_id: string
        }
        Insert: {
          computed_at?: string
          customer_id: string
          prefiere?: Json
          store_id: string
          tenant_id: string
        }
        Update: {
          computed_at?: string
          customer_id?: string
          prefiere?: Json
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_preferences_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_preferences_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          store_id: string
          tax_id: string | null
          tax_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          phone: string
          store_id: string
          tax_id?: string | null
          tax_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          store_id?: string
          tax_id?: string | null
          tax_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      description_proposals: {
        Row: {
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          product_id: string
          proposed: string
          status: string
          store_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          product_id: string
          proposed: string
          status?: string
          store_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          product_id?: string
          proposed?: string
          status?: string
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "description_proposals_product_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "description_proposals_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "description_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_sync_runs: {
        Row: {
          adapter: string
          created_count: number
          error_details: Json
          finished_at: string | null
          id: string
          items_received: number
          mode: string
          products_seen: number
          started_at: string
          store_id: string
          tenant_id: string
          unchanged_count: number
          unmatched_count: number
          updated_count: number
        }
        Insert: {
          adapter: string
          created_count?: number
          error_details?: Json
          finished_at?: string | null
          id?: string
          items_received?: number
          mode: string
          products_seen?: number
          started_at?: string
          store_id: string
          tenant_id: string
          unchanged_count?: number
          unmatched_count?: number
          updated_count?: number
        }
        Update: {
          adapter?: string
          created_count?: number
          error_details?: Json
          finished_at?: string | null
          id?: string
          items_received?: number
          mode?: string
          products_seen?: number
          started_at?: string
          store_id?: string
          tenant_id?: string
          unchanged_count?: number
          unmatched_count?: number
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_sync_runs_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "erp_sync_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          store_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          store_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          store_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      home_sections: {
        Row: {
          collection_id: string | null
          created_at: string
          id: string
          layout: string
          position: number
          published: boolean
          settings: Json
          store_id: string
          subtitle: string | null
          tenant_id: string
          title: string | null
          type: Database["public"]["Enums"]["home_section_type"]
          updated_at: string
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          id?: string
          layout?: string
          position?: number
          published?: boolean
          settings?: Json
          store_id: string
          subtitle?: string | null
          tenant_id: string
          title?: string | null
          type: Database["public"]["Enums"]["home_section_type"]
          updated_at?: string
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          id?: string
          layout?: string
          position?: number
          published?: boolean
          settings?: Json
          store_id?: string
          subtitle?: string | null
          tenant_id?: string
          title?: string | null
          type?: Database["public"]["Enums"]["home_section_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_sections_collection_id_fkey"
            columns: ["collection_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "home_sections_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "home_sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_levels: {
        Row: {
          available: number
          id: string
          location_id: string
          tenant_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          available?: number
          id?: string
          location_id: string
          tenant_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          available?: number
          id?: string
          location_id?: string
          tenant_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "inventory_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          erp_location_id: string | null
          id: string
          is_pickup_point: boolean
          name: string
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          erp_location_id?: string | null
          id?: string
          is_pickup_point?: boolean
          name: string
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          erp_location_id?: string | null
          id?: string
          is_pickup_point?: boolean
          name?: string
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          note: string | null
          order_id: string | null
          points: number
          promotion_id: string | null
          review_id: string | null
          reward_id: string | null
          source: Database["public"]["Enums"]["loyalty_source"]
          store_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          note?: string | null
          order_id?: string | null
          points: number
          promotion_id?: string | null
          review_id?: string | null
          reward_id?: string | null
          source: Database["public"]["Enums"]["loyalty_source"]
          store_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          note?: string | null
          order_id?: string | null
          points?: number
          promotion_id?: string | null
          review_id?: string | null
          reward_id?: string | null
          source?: Database["public"]["Enums"]["loyalty_source"]
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_customer_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "loyalty_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "loyalty_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          created_at: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          max_per_customer: number | null
          max_redemptions: number | null
          points_cost: number
          redemptions: number
          starts_at: string | null
          status: Database["public"]["Enums"]["promotion_status"]
          store_id: string
          target: Json
          tenant_id: string
          title: string
          updated_at: string
          valid_days: number
        }
        Insert: {
          created_at?: string
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          max_per_customer?: number | null
          max_redemptions?: number | null
          points_cost: number
          redemptions?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          store_id: string
          target?: Json
          tenant_id: string
          title: string
          updated_at?: string
          valid_days?: number
        }
        Update: {
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          max_per_customer?: number | null
          max_redemptions?: number | null
          points_cost?: number
          redemptions?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          store_id?: string
          target?: Json
          tenant_id?: string
          title?: string
          updated_at?: string
          valid_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "loyalty_rewards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      media_proposals: {
        Row: {
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          original_url: string
          product_id: string
          proposed_url: string
          status: string
          store_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          original_url: string
          product_id: string
          proposed_url: string
          status?: string
          store_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          original_url?: string
          product_id?: string
          proposed_url?: string
          status?: string
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_proposals_product_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "media_proposals_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "media_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          created_at: string
          event: string
          id: string
          order_id: string | null
          payload: Json
          recipient: string
          sent_at: string | null
          store_id: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event: string
          id?: string
          order_id?: string | null
          payload?: Json
          recipient: string
          sent_at?: string | null
          store_id: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event?: string
          id?: string
          order_id?: string | null
          payload?: Json
          recipient?: string
          sent_at?: string | null
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_order_id_fkey"
            columns: ["order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "notification_outbox_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "notification_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_counters: {
        Row: {
          last_number: number
          store_id: string
          tenant_id: string
        }
        Insert: {
          last_number: number
          store_id: string
          tenant_id: string
        }
        Update: {
          last_number?: number
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_counters_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "order_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          data: Json
          id: string
          order_id: string
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          order_id: string
          tenant_id: string
          type: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          order_id?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "order_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          currency: string
          id: string
          order_id: string
          position: number
          quantity: number
          sku: string
          stock_allocation: Json
          tenant_id: string
          title: string
          unit_cost: number | null
          unit_price: number
          variant_id: string | null
          variant_title: string | null
        }
        Insert: {
          currency: string
          id?: string
          order_id: string
          position: number
          quantity: number
          sku: string
          stock_allocation?: Json
          tenant_id: string
          title: string
          unit_cost?: number | null
          unit_price: number
          variant_id?: string | null
          variant_title?: string | null
        }
        Update: {
          currency?: string
          id?: string
          order_id?: string
          position?: number
          quantity?: number
          sku?: string
          stock_allocation?: Json
          tenant_id?: string
          title?: string
          unit_cost?: number | null
          unit_price?: number
          variant_id?: string | null
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      orders: {
        Row: {
          access_token: string
          address: Json
          applied_promotions: Json
          created_at: string
          currency: string
          customer: Json
          customer_id: string | null
          discount_amount: number
          id: string
          idempotency_key: string
          is_demo: boolean
          notes: string | null
          number: number
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          shipping_amount: number
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal_amount: number | null
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          access_token?: string
          address: Json
          applied_promotions?: Json
          created_at?: string
          currency: string
          customer: Json
          customer_id?: string | null
          discount_amount?: number
          id?: string
          idempotency_key: string
          is_demo?: boolean
          notes?: string | null
          number: number
          payment_method: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          shipping_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal_amount?: number | null
          tenant_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          access_token?: string
          address?: Json
          applied_promotions?: Json
          created_at?: string
          currency?: string
          customer?: Json
          customer_id?: string | null
          discount_amount?: number
          id?: string
          idempotency_key?: string
          is_demo?: boolean
          notes?: string | null
          number?: number
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          shipping_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal_amount?: number | null
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_affinity: {
        Row: {
          co_orders: number
          co_views: number
          computed_at: string
          product_id: string
          related_id: string
          score: number
          store_id: string
          tenant_id: string
        }
        Insert: {
          co_orders?: number
          co_views?: number
          computed_at?: string
          product_id: string
          related_id: string
          score: number
          store_id: string
          tenant_id: string
        }
        Update: {
          co_orders?: number
          co_views?: number
          computed_at?: string
          product_id?: string
          related_id?: string
          score?: number
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_affinity_product_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_affinity_related_fkey"
            columns: ["related_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_affinity_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_affinity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_embeddings: {
        Row: {
          embedding: string | null
          hash: string
          product_id: string
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          embedding?: string | null
          hash: string
          product_id: string
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          embedding?: string | null
          hash?: string
          product_id?: string
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_embeddings_product_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_embeddings_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_embeddings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_groups_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt: string
          created_at: string
          height: number
          id: string
          position: number
          product_id: string
          tenant_id: string
          url: string
          width: number
        }
        Insert: {
          alt?: string
          created_at?: string
          height: number
          id?: string
          position?: number
          product_id: string
          tenant_id: string
          url: string
          width: number
        }
        Update: {
          alt?: string
          created_at?: string
          height?: number
          id?: string
          position?: number
          product_id?: string
          tenant_id?: string
          url?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          body: string | null
          created_at: string
          customer_id: string
          id: string
          order_id: string
          product_id: string
          rating: number
          status: Database["public"]["Enums"]["review_status"]
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id: string
          id?: string
          order_id: string
          product_id: string
          rating: number
          status?: Database["public"]["Enums"]["review_status"]
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string
          product_id?: string
          rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_customer_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_reviews_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_trending: {
        Row: {
          computed_at: string
          product_id: string
          score: number
          store_id: string
          tenant_id: string
        }
        Insert: {
          computed_at?: string
          product_id: string
          score: number
          store_id: string
          tenant_id: string
        }
        Update: {
          computed_at?: string
          product_id?: string
          score?: number
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_trending_product_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_trending_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_trending_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          barcode: string | null
          compare_at_price: number | null
          cost: number | null
          created_at: string
          currency: string
          erp_size: string | null
          field_sources: Json
          id: string
          internal_code: string | null
          position: number
          price: number
          product_id: string
          sku: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string
          currency: string
          erp_size?: string | null
          field_sources?: Json
          id?: string
          internal_code?: string | null
          position?: number
          price: number
          product_id: string
          sku: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string
          currency?: string
          erp_size?: string | null
          field_sources?: Json
          id?: string
          internal_code?: string | null
          position?: number
          price?: number
          product_id?: string
          sku?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_variants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          description: string | null
          dimensions: Json | null
          field_sources: Json
          handle: string
          id: string
          last_sync_at: string | null
          product_group_id: string | null
          search_doc: string | null
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          store_id: string
          sync_error: string | null
          tax: Json | null
          tenant_id: string
          title: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          dimensions?: Json | null
          field_sources?: Json
          handle: string
          id?: string
          last_sync_at?: string | null
          product_group_id?: string | null
          search_doc?: string | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          store_id: string
          sync_error?: string | null
          tax?: Json | null
          tenant_id: string
          title: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          dimensions?: Json | null
          field_sources?: Json
          handle?: string
          id?: string
          last_sync_at?: string | null
          product_group_id?: string | null
          search_doc?: string | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          store_id?: string
          sync_error?: string | null
          tax?: Json | null
          tenant_id?: string
          title?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "products_product_group_id_fkey"
            columns: ["product_group_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          code: string | null
          created_at: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          min_quantity: number | null
          min_subtotal: number | null
          priority: number
          stackable: boolean
          starts_at: string | null
          status: Database["public"]["Enums"]["promotion_status"]
          store_id: string
          target: Json
          tenant_id: string
          title: string
          updated_at: string
          usage_count: number
          usage_limit: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          min_quantity?: number | null
          min_subtotal?: number | null
          priority?: number
          stackable?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          store_id: string
          target?: Json
          tenant_id: string
          title: string
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          min_quantity?: number | null
          min_subtotal?: number | null
          priority?: number
          stackable?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          store_id?: string
          target?: Json
          tenant_id?: string
          title?: string
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "promotions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: []
      }
      search_queries: {
        Row: {
          embedded_at: string | null
          embedding: string | null
          hash: string
          hits: number
          last_seen: string
          store_id: string
          tenant_id: string
          termino: string
        }
        Insert: {
          embedded_at?: string | null
          embedding?: string | null
          hash: string
          hits?: number
          last_seen?: string
          store_id: string
          tenant_id: string
          termino: string
        }
        Update: {
          embedded_at?: string | null
          embedding?: string | null
          hash?: string
          hits?: number
          last_seen?: string
          store_id?: string
          tenant_id?: string
          termino?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_queries_store_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "search_queries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      session_identities: {
        Row: {
          customer_id: string
          linked_at: string
          session_id: string
          store_id: string
          tenant_id: string
        }
        Insert: {
          customer_id: string
          linked_at?: string
          session_id: string
          store_id: string
          tenant_id: string
        }
        Update: {
          customer_id?: string
          linked_at?: string
          session_id?: string
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_identities_customer_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "session_identities_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "session_identities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_events: {
        Row: {
          data: Json
          dedupe_key: string | null
          device_id: string | null
          id: number
          occurred_at: string
          path: string | null
          session_id: string
          store_id: string
          tenant_id: string
          type: string
        }
        Insert: {
          data?: Json
          dedupe_key?: string | null
          device_id?: string | null
          id?: never
          occurred_at?: string
          path?: string | null
          session_id: string
          store_id: string
          tenant_id: string
          type: string
        }
        Update: {
          data?: Json
          dedupe_key?: string | null
          device_id?: string | null
          id?: never
          occurred_at?: string
          path?: string | null
          session_id?: string
          store_id?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_events_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "store_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          settings: Json
          store_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          settings?: Json
          store_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          settings?: Json
          store_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "store_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          currency: string
          domain: string | null
          id: string
          locale: string
          name: string
          slug: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          domain?: string | null
          id?: string
          locale?: string
          name: string
          slug: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          domain?: string | null
          id?: string
          locale?: string
          name?: string
          slug?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          product_id: string
          store_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          product_id: string
          store_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          product_id?: string
          store_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_customer_id_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "wishlist_items_store_id_fkey"
            columns: ["store_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "wishlist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_analytics: {
        Args: { p_from: string; p_store_id: string; p_to: string }
        Returns: Json
      }
      admin_apply_description_proposals: {
        Args: { p_ids: string[]; p_store_id: string }
        Returns: number
      }
      admin_apply_media_proposals: {
        Args: { p_ids: string[]; p_store_id: string }
        Returns: number
      }
      admin_customer_cohorts: {
        Args: { p_months?: number; p_store_id: string; p_tz?: string }
        Returns: Json
      }
      admin_customer_segments: {
        Args: {
          p_page?: number
          p_per_page?: number
          p_segment?: string
          p_store_id: string
        }
        Returns: Json
      }
      admin_customers: {
        Args: {
          p_customer_id?: string
          p_from?: string
          p_page?: number
          p_per_page?: number
          p_query?: string
          p_store_id: string
          p_to?: string
        }
        Returns: Json
      }
      admin_dashboard: {
        Args: { p_from: string; p_store_id: string; p_to: string }
        Returns: Json
      }
      admin_inventory_aging: {
        Args: {
          p_bucket?: string
          p_page?: number
          p_per_page?: number
          p_store_id: string
        }
        Returns: Json
      }
      admin_locations: { Args: { p_store_id: string }; Returns: Json }
      admin_loyalty: { Args: { p_store_id: string }; Returns: Json }
      admin_moderate_reviews: {
        Args: { p_ids: string[]; p_status: string; p_store_id: string }
        Returns: number
      }
      admin_order_notifications: {
        Args: { p_order_id: string; p_store_id: string }
        Returns: Json
      }
      admin_orders: {
        Args: {
          p_page?: number
          p_per_page?: number
          p_query?: string
          p_status?: string
          p_store_id: string
        }
        Returns: Json
      }
      admin_product_performance: {
        Args: {
          p_from: string
          p_modo?: string
          p_page?: number
          p_per_page?: number
          p_store_id: string
          p_to: string
        }
        Returns: Json
      }
      admin_product_reviews: {
        Args: {
          p_page?: number
          p_per_page?: number
          p_status?: string
          p_store_id: string
        }
        Returns: Json
      }
      admin_products: {
        Args: {
          p_page?: number
          p_per_page?: number
          p_query?: string
          p_status?: string
          p_store_id: string
        }
        Returns: Json
      }
      admin_products_without_description: {
        Args: { p_page?: number; p_per_page?: number; p_store_id: string }
        Returns: Json
      }
      admin_products_without_photo: {
        Args: { p_page?: number; p_per_page?: number; p_store_id: string }
        Returns: Json
      }
      admin_save_ai_credential: {
        Args: {
          p_ciphertext: string
          p_last4: string
          p_model: string
          p_store_id: string
        }
        Returns: Json
      }
      admin_save_product: {
        Args: { p_producto: Json; p_store_id: string }
        Returns: string
      }
      admin_save_settings: {
        Args: { p_audit?: Json; p_settings: Json; p_store_id: string }
        Returns: Json
      }
      admin_section_performance: {
        Args: { p_days?: number; p_store_id: string }
        Returns: Json
      }
      admin_set_order_status: {
        Args: {
          p_note?: string
          p_order_id: string
          p_status: string
          p_store_id: string
        }
        Returns: Json
      }
      admin_set_payment_status: {
        Args: {
          p_note?: string
          p_order_id: string
          p_status: string
          p_store_id: string
        }
        Returns: Json
      }
      admin_team: { Args: { p_tenant: string }; Returns: Json }
      ai_credential_secret: { Args: { p_store_id: string }; Returns: Json }
      ai_credential_status: { Args: { p_store_id: string }; Returns: Json }
      canjear_premio: {
        Args: { p_reward_id: string; p_store_id: string }
        Returns: Json
      }
      cart_promotions: {
        Args: { p_code?: string; p_lines: Json; p_store_id: string }
        Returns: Json
      }
      catalog_search: {
        Args: {
          p_collection?: string
          p_filters?: Json
          p_handle?: string
          p_page?: number
          p_per_page?: number
          p_prefiere?: Json
          p_price_max?: number
          p_price_min?: number
          p_search?: string
          p_sort?: string
          p_store_id: string
        }
        Returns: Json
      }
      claim_notifications: {
        Args: { p_limit?: number; p_store_id: string }
        Returns: {
          attempts: number
          created_at: string
          event: string
          id: string
          order_id: string | null
          payload: Json
          recipient: string
          sent_at: string | null
          store_id: string
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_order: {
        Args: { p_idempotency_key: string; p_input: Json; p_store_id: string }
        Returns: Json
      }
      customer_orders: {
        Args: { p_page?: number; p_per_page?: number; p_store_id: string }
        Returns: Json
      }
      escribir_resena: {
        Args: {
          p_body?: string
          p_product_id: string
          p_rating: number
          p_store_id: string
        }
        Returns: string
      }
      forget_device: {
        Args: { p_device_id: string; p_store_id: string }
        Returns: number
      }
      forget_my_preferences: {
        Args: { p_store_id: string }
        Returns: undefined
      }
      import_products: {
        Args: { p_productos: Json; p_store_id: string }
        Returns: Json
      }
      link_customer_account: {
        Args: { p_email: string; p_store_id: string; p_user_id: string }
        Returns: string
      }
      mark_notification_sent: {
        Args: { p_id: string; p_store_id: string }
        Returns: undefined
      }
      mi_resena: {
        Args: { p_product_id: string; p_store_id: string }
        Returns: Json
      }
      mis_puntos: {
        Args: { p_limite?: number; p_store_id: string }
        Returns: Json
      }
      my_preferences: { Args: { p_store_id: string }; Returns: Json }
      order_by_token: {
        Args: { p_number: number; p_store_id: string; p_token: string }
        Returns: Json
      }
      order_json: { Args: { p_order_id: string }; Returns: Json }
      premios_disponibles: { Args: { p_store_id: string }; Returns: Json }
      product_reviews_publicas: {
        Args: { p_limite?: number; p_product_id: string; p_store_id: string }
        Returns: Json
      }
      recently_viewed: {
        Args: { p_device_id: string; p_limit?: number; p_store_id: string }
        Returns: Json
      }
      recommended_products: {
        Args: { p_anchor_ids: string[]; p_limit?: number; p_store_id: string }
        Returns: Json
      }
      recompute_affinity: {
        Args: {
          p_cada?: string
          p_peso_compra?: number
          p_peso_vista?: number
          p_store_id: string
        }
        Returns: number
      }
      record_payment: {
        Args: {
          p_note?: string
          p_order_id: string
          p_reference: string
          p_status: string
          p_store_id: string
        }
        Returns: Json
      }
      registrar_busqueda: {
        Args: { p_store_id: string; p_termino: string; p_vector?: string }
        Returns: boolean
      }
      registrar_uso_de_ia: {
        Args: { p_store_id: string; p_tipo: string; p_tokens: number }
        Returns: number
      }
      search_suggest: {
        Args: { p_limit?: number; p_q: string; p_store_id: string }
        Returns: Json
      }
      visitor_preferences: {
        Args: { p_device_id: string; p_store_id: string }
        Returns: Json
      }
      wishlist_products: { Args: { p_store_id: string }; Returns: Json }
    }
    Enums: {
      home_section_type: "hero" | "tiles" | "products" | "categories"
      loyalty_source:
        | "compra"
        | "resena"
        | "canje"
        | "reverso"
        | "vencimiento"
        | "ajuste"
      member_role: "owner" | "admin" | "staff" | "viewer"
      order_status:
        | "received"
        | "confirmed"
        | "preparing"
        | "ready"
        | "shipped"
        | "in_transit"
        | "delivered"
        | "cancelled"
      payment_status: "pending" | "paid" | "failed"
      product_status: "draft" | "active" | "inactive" | "archived"
      promotion_status: "draft" | "active" | "archived"
      review_status: "pending" | "published" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      home_section_type: ["hero", "tiles", "products", "categories"],
      loyalty_source: [
        "compra",
        "resena",
        "canje",
        "reverso",
        "vencimiento",
        "ajuste",
      ],
      member_role: ["owner", "admin", "staff", "viewer"],
      order_status: [
        "received",
        "confirmed",
        "preparing",
        "ready",
        "shipped",
        "in_transit",
        "delivered",
        "cancelled",
      ],
      payment_status: ["pending", "paid", "failed"],
      product_status: ["draft", "active", "inactive", "archived"],
      promotion_status: ["draft", "active", "archived"],
      review_status: ["pending", "published", "rejected"],
    },
  },
} as const
