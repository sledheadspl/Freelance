export type ConfidenceGrade = 'A' | 'B' | 'C' | 'D';
export type Recommendation = 'buy' | 'maybe' | 'skip';
export type SubscriptionTier = 'free' | 'pro';
export type InventoryStatus = 'unlisted' | 'listed' | 'sold' | 'shipped';
export type OrderStatus = 'awaiting_shipment' | 'shipped' | 'delivered' | 'cancelled';

export interface IdentifiedAttributes {
  brand?: string | null;
  model?: string | null;
  part_number?: string | null;
  notable_flaws?: string[];
  [key: string]: unknown;
}

export interface CompListing {
  title: string;
  sold_price: number;
  sold_date: string;
  condition: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          ebay_connected: boolean;
          ebay_refresh_token: string | null;
          subscription_tier: SubscriptionTier;
          scans_this_month: number;
          created_at: string;
        };
        Insert: {
          id: string;
          ebay_connected?: boolean;
          ebay_refresh_token?: string | null;
          subscription_tier?: SubscriptionTier;
          scans_this_month?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
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
          sold_price?: number | null;
          sold_at?: string | null;
          shipped_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>;
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
      };
    };
  };
}
