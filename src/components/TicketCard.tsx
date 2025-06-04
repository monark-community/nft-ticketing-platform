
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, User, TrendingUp, TrendingDown } from "lucide-react";

interface Ticket {
  id: number;
  eventTitle: string;
  date: string;
  location: string;
  price: string;
  originalPrice: string;
  seller: string;
  category: string;
  image: string;
}

interface TicketCardProps {
  ticket: Ticket;
}

const TicketCard = ({ ticket }: TicketCardProps) => {
  const priceChange = parseFloat(ticket.price) - parseFloat(ticket.originalPrice);
  const isResale = priceChange !== 0;

  return (
    <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 backdrop-blur-sm">
      <div className="relative overflow-hidden">
        <div className="h-48 bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <div className="text-white text-4xl font-bold opacity-30">#{ticket.id}</div>
        </div>
        
        <div className="absolute top-3 left-3">
          <Badge variant="secondary" className="bg-white/90 text-gray-700">
            {ticket.category}
          </Badge>
        </div>
        
        {isResale && (
          <div className="absolute top-3 right-3">
            <Badge 
              className={`${priceChange > 0 ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'}`}
            >
              {priceChange > 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Resale
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 mr-1" />
                  Sale
                </>
              )}
            </Badge>
          </div>
        )}
      </div>
      
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-gray-800 group-hover:text-purple-600 transition-colors">
          {ticket.eventTitle}
        </CardTitle>
        <CardDescription className="text-gray-600">
          NFT Ticket #{ticket.id}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            {new Date(ticket.date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
          
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="h-4 w-4 mr-2" />
            {ticket.location}
          </div>
          
          <div className="flex items-center text-sm text-gray-600">
            <User className="h-4 w-4 mr-2" />
            Seller: {ticket.seller}
          </div>
        </div>
        
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-2xl font-bold text-gray-800">
                {ticket.price} ETH
              </div>
              {isResale && (
                <div className="text-sm text-gray-500">
                  Original: {ticket.originalPrice} ETH
                  <span className={`ml-1 ${priceChange > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    ({priceChange > 0 ? '+' : ''}{(priceChange * 100 / parseFloat(ticket.originalPrice)).toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 border-purple-200 hover:border-purple-400"
            >
              View Details
            </Button>
            <Button 
              size="sm" 
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              Buy Now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TicketCard;
