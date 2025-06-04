
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import Header from "@/components/Header";
import TicketCard from "@/components/TicketCard";

const Marketplace = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBy, setFilterBy] = useState("all");

  const tickets = [
    {
      id: 1,
      eventTitle: "Summer Music Festival 2024",
      date: "2024-07-15",
      location: "Central Park, NYC",
      price: "0.05",
      originalPrice: "0.05",
      seller: "0x1234...5678",
      category: "Music",
      image: "/placeholder.svg"
    },
    {
      id: 2,
      eventTitle: "Tech Conference 2024",
      date: "2024-08-20",
      location: "Convention Center, SF",
      price: "0.08",
      originalPrice: "0.02",
      seller: "0x9876...5432",
      category: "Conference",
      image: "/placeholder.svg"
    },
    {
      id: 3,
      eventTitle: "Art Gallery Opening",
      date: "2024-06-30",
      location: "Modern Art Museum",
      price: "0.03",
      originalPrice: "0.03",
      seller: "0x1111...2222",
      category: "Art",
      image: "/placeholder.svg"
    },
    {
      id: 4,
      eventTitle: "Basketball Championship",
      date: "2024-09-10",
      location: "Sports Arena",
      price: "0.12",
      originalPrice: "0.10",
      seller: "0x3333...4444",
      category: "Sports",
      image: "/placeholder.svg"
    },
    {
      id: 5,
      eventTitle: "Comedy Night",
      date: "2024-07-05",
      location: "Comedy Club Downtown",
      price: "0.02",
      originalPrice: "0.02",
      seller: "0x5555...6666",
      category: "Comedy",
      image: "/placeholder.svg"
    },
    {
      id: 6,
      eventTitle: "Film Festival Premiere",
      date: "2024-08-15",
      location: "Historic Theater",
      price: "0.06",
      originalPrice: "0.05",
      seller: "0x7777...8888",
      category: "Film",
      image: "/placeholder.svg"
    }
  ];

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.eventTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterBy === "all" || ticket.category.toLowerCase() === filterBy.toLowerCase();
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">NFT Ticket Marketplace</h1>
          <p className="text-gray-600">Discover and purchase verified event tickets</p>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 mb-8 shadow-lg">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search events, locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={filterBy} onValueChange={setFilterBy}>
              <SelectTrigger className="w-full md:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="music">Music</SelectItem>
                <SelectItem value="conference">Conference</SelectItem>
                <SelectItem value="art">Art</SelectItem>
                <SelectItem value="sports">Sports</SelectItem>
                <SelectItem value="comedy">Comedy</SelectItem>
                <SelectItem value="film">Film</SelectItem>
              </SelectContent>
            </Select>
            
            <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
              Search
            </Button>
          </div>
        </div>

        {/* Results Summary */}
        <div className="mb-6">
          <p className="text-gray-600">
            Showing {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
            {searchTerm && ` for "${searchTerm}"`}
            {filterBy !== "all" && ` in ${filterBy}`}
          </p>
        </div>

        {/* Tickets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>

        {filteredTickets.length === 0 && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="mb-6">
                <Search className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">No Tickets Found</h3>
                <p className="text-gray-500">
                  Try adjusting your search terms or filters to find what you're looking for
                </p>
              </div>
              <Button 
                onClick={() => {
                  setSearchTerm("");
                  setFilterBy("all");
                }}
                variant="outline"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Marketplace;
