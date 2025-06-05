
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ticket, Shield, Wallet, QrCode } from "lucide-react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import FeatureCard from "@/components/FeatureCard";
import Footer from "@/components/Footer";

const Index = () => {
  const features = [
    {
      icon: Ticket,
      title: "NFT Ticket Creation",
      description: "Create unique, verifiable NFT tickets with custom metadata and pricing"
    },
    {
      icon: Shield,
      title: "Anti-Fraud Protection",
      description: "Blockchain verification eliminates counterfeit tickets and unauthorized access"
    },
    {
      icon: Wallet,
      title: "Wallet Integration",
      description: "Seamless connection with popular crypto wallets for secure transactions"
    },
    {
      icon: QrCode,
      title: "QR Code Verification",
      description: "Quick entry verification through QR scanning and signature validation"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      <Header />
      <Hero />
      
      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
              Why Choose NFTokenPass?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Revolutionary ticketing technology that benefits organizers, artists, and fans
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-purple-600 to-blue-600">
        <div className="container mx-auto max-w-4xl text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Transform Your Events?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join the future of event ticketing with blockchain technology
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/dashboard">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                Create Event
              </Button>
            </Link>
            <Link to="/marketplace">
              <Button size="lg" variant="outline" className="w-full sm:w-auto bg-transparent border-white text-white hover:bg-white hover:text-purple-600">
                Browse Tickets
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
