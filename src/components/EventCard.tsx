
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, QrCode } from "lucide-react";

interface Event {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
  price: string;
  totalTickets: number;
  soldTickets: number;
  image: string;
}

interface EventCardProps {
  event: Event;
}

const EventCard = ({ event }: EventCardProps) => {
  const soldPercentage = (event.soldTickets / event.totalTickets) * 100;

  return (
    <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 backdrop-blur-sm">
      <div className="relative overflow-hidden">
        <div className="h-48 bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <div className="text-white text-6xl font-bold opacity-20">NFT</div>
        </div>
        <Badge className="absolute top-3 right-3 bg-green-500 hover:bg-green-600">
          {event.soldTickets}/{event.totalTickets} sold
        </Badge>
      </div>
      
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-gray-800 group-hover:text-purple-600 transition-colors">
          {event.title}
        </CardTitle>
        <CardDescription className="text-gray-600">
          {event.description}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            {new Date(event.date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
          
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="h-4 w-4 mr-2" />
            {event.location}
          </div>
          
          <div className="flex items-center text-sm text-gray-600">
            <Users className="h-4 w-4 mr-2" />
            {event.soldTickets} / {event.totalTickets} tickets sold
          </div>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${soldPercentage}%` }}
          ></div>
        </div>
        
        <div className="flex items-center justify-between pt-4">
          <div className="text-lg font-semibold text-gray-800">
            {event.price} ETH
          </div>
          
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-purple-200 hover:border-purple-400">
              <QrCode className="h-4 w-4 mr-1" />
              Verify
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
              Manage
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EventCard;
