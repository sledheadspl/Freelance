export type ConfidenceGrade = 'A' | 'B' | 'C' | 'D';
export type Recommendation = 'buy' | 'maybe' | 'skip';
export type SubscriptionTier = 'free' | 'pro';
export type InventoryStatus = 'unlisted' | 'listed' | 'sold' | 'shipped';
export type OrderStatus = 'awaiting_shipment' | 'shipped' | 'delivered' | 'cancelled';

export type ConditionEstimate = 'new' | 'like_new' | 'good' | 'fair' | 'parts_only';

export interface IdentifiedAttributes {
  brand?: string | null;
  model?: string | null;
  part_number?: string | null;
  condition_estimate?: ConditionEstimate;
  search_query?: string;
  notable_flaws?: string[];
  id_confidence?: number;
  [key: string]: unknown;
}

export interface CompListing {
  title: string;
  sold_price: number;
  sold_date: string;
  condition: string;
}

export interface DiscoveryAttributes {
  notable_features?: string[];
  next_steps?: string[];
  search_query?: string;
  similar_listings?: string[];
  [key: string]: unknown;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          ebay_connected: boolean;
          ebay_refresh_token: string | null;
          push_token: string | null;
          subscription_tier: SubscriptionTier;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          scans_this_month: number;
          created_at: string;
        };
        Insert: {
          id: string;
          ebay_connected?: boolean;
          ebay_refresh_token?: string | null;
          push_token?: string | null;
          subscription_tier?: SubscriptionTier;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          scans_this_month?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      scans: {
        Row: {
          id: string;
          user_id: string;
          image_url: string | null;
          identified_name: string | null;
          identified_category: string | null;
          identified_attributes: IdentifiedAttributes | null;
          est_sale_price: number | null;
          est_sale_low: number | null;
          est_sale_high: number | null;
          comps_count: number | null;
          sell_through_days: number | null;
          confidence_grade: ConfidenceGrade | null;
          recommendation: Recommendation | null;
          max_buy_price: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url?: string | null;
          identified_name?: string | null;
          identified_category?: string | null;
          identified_attributes?: IdentifiedAttributes | null;
          est_sale_price?: number | null;
          est_sale_low?: number | null;
          est_sale_high?: number | null;
          comps_count?: number | null;
          sell_through_days?: number | null;
          confidence_grade?: ConfidenceGrade | null;
          recommendation?: Recommendation | null;
          max_buy_price?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['scans']['Insert']>;
        Relationships: [];
      };
      inventory: {
        Row: {
          id: string;
          user_id: string;
          scan_id: string | null;
          purchase_price: number;
          status: InventoryStatus;
          ebay_listing_id: string | null;
          ebay_offer_id: string | null;
          listed_price: number | null;
          listing_title: string | null;
          listing_description: string | null;
          sold_price: number | null;
          sold_at: string | null;
          shipped_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          scan_id?: string | null;
          purchase_price: number;
          status?: InventoryStatus;
          ebay_listing_id?: string | null;
          ebay_offer_id?: string | null;
          listed_price?: number | null;
          listing_title?: string | null;
          listing_description?: string | null;
          sold_price?: number | null;
          sold_at?: string | null;
          shipped_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>;
        Relationships: [];
      };
      comps_cache: {
        Row: {
          id: string;
          query_key: string;
          comps: CompListing[] | null;
          fetched_at: string;
        };
        Insert: {
          id?: string;
          query_key: string;
          comps?: CompListing[] | null;
          fetched_at?: string;
        };
        Update: Partial<Database['public']['Tables']['comps_cache']['Insert']>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          inventory_id: string | null;
          ebay_order_id: string | null;
          buyer_username: string | null;
          ship_by: string | null;
          tracking_number: string | null;
          status: OrderStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          inventory_id?: string | null;
          ebay_order_id?: string | null;
          buyer_username?: string | null;
          ship_by?: string | null;
          tracking_number?: string | null;
          status?: OrderStatus;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
        Relationships: [];
      };
      discoveries: {
        Row: {
          id: string;
          user_id: string;
          image_url: string | null;
          latitude: number | null;
          longitude: number | null;
          captured_at: string;
          identified_name: string | null;
          identified_category: string | null;
          description: string | null;
          confidence_grade: ConfidenceGrade | null;
          identified_attributes: DiscoveryAttributes | null;
          est_sale_price: number | null;
          est_sale_low: number | null;
          est_sale_high: number | null;
          comps_count: number | null;
          shared: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          captured_at?: string;
          identified_name?: string | null;
          identified_category?: string | null;
          description?: string | null;
          confidence_grade?: ConfidenceGrade | null;
          identified_attributes?: DiscoveryAttributes | null;
          est_sale_price?: number | null;
          est_sale_low?: number | null;
          est_sale_high?: number | null;
          comps_count?: number | null;
          shared?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['discoveries']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
