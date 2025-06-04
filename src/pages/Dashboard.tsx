
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Calendar, MapPin, Users, DollarSign } from "lucide-react";
import Header from "@/components/Header";
import EventCard from "@/components/EventCard";

const Dashboard = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [events, setEvents] = useState([
    {
      id: 1,
      title: "Summer Music Festival 2024",
      description: "An amazing outdoor music festival",
      date: "2024-07-15",
      location: "Central Park, NYC",
      price: "0.05 ETH",
      totalTickets: 1000,
      soldTickets: 750,
      image: "/placeholder.svg"
    },
    {
      id: 2,
      title: "Tech Conference 2024",
      description: "The latest in blockchain technology",
      date: "2024-08-20",
      location: "Convention Center, SF",
      price: "0.02 ETH",
      totalTickets: 500,
      soldTickets: 320,
      image: "/placeholder.svg"
    }
  ]);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    location: "",
    price: "",
    totalTickets: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const newEvent = {
      id: events.length + 1,
      ...formData,
      soldTickets: 0,
      totalTickets: parseInt(formData.totalTickets),
      image: "/placeholder.svg"
    };
    setEvents([...events, newEvent]);
    setFormData({
      title: "",
      description: "",
      date: "",
      location: "",
      price: "",
      totalTickets: ""
    });
    setShowCreateForm(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Event Dashboard</h1>
            <p className="text-gray-600">Manage your NFT ticketed events</p>
          </div>
          
          <Button 
            onClick={() => setShowCreateForm(true)}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Event
          </Button>
        </div>

        {/* Create Event Form */}
        {showCreateForm && (
          <Card className="mb-8 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Create New Event</CardTitle>
              <CardDescription>
                Set up your event details and NFT ticket parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateEvent} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="title">Event Title</Label>
                    <Input
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      placeholder="Enter event title"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="date">Event Date</Label>
                    <Input
                      id="date"
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      name="location"
                      value={formData.location}
                      onChange={handleInputChange}
                      placeholder="Event location"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="price">Ticket Price (ETH)</Label>
                    <Input
                      id="price"
                      name="price"
                      value={formData.price}
                      onChange={handleInputChange}
                      placeholder="0.05"
                      step="0.001"
                      type="number"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="totalTickets">Total Tickets</Label>
                    <Input
                      id="totalTickets"
                      name="totalTickets"
                      type="number"
                      value={formData.totalTickets}
                      onChange={handleInputChange}
                      placeholder="1000"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Describe your event..."
                    rows={4}
                    required
                  />
                </div>
                
                <div className="flex gap-4">
                  <Button type="submit" className="bg-gradient-to-r from-purple-600 to-blue-600">
                    Create Event
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>

        {events.length === 0 && !showCreateForm && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="mb-6">
                <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">No Events Yet</h3>
                <p className="text-gray-500">Create your first NFT ticketed event to get started</p>
              </div>
              <Button 
                onClick={() => setShowCreateForm(true)}
                className="bg-gradient-to-r from-purple-600 to-blue-600"
              >
                Create Your First Event
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
