import { useEffect, useMemo, useRef, useState } from "react";
import {
    Activity,
    ArrowLeft,
    CheckCircle,
    Edit,
    MapPin,
    Plug,
    Plus,
    Power,
    RefreshCw,
    RotateCw,
    Search,
    Settings,
    Trash2,
    XCircle,
    Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Separator } from "./ui/separator";
import { ScrollArea } from "./ui/scroll-area";
import axios, { AxiosError } from "axios";
import * as maptilersdk from "@maptiler/sdk";
import { toast, Toaster } from "sonner";
import "@maptiler/sdk/dist/maptiler-sdk.css";
// ========= Types =========

type StationStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";

interface ConnectorType {
    type: string;
    available: number;
    total: number;
    power: string;
    connectorTypeId?: number;
    typeName?: string;
    powerOutput?: number;
    pricePerKwh?: number;
    vehicles?: any[];
}

interface ChargingPoint {
    chargingPointId: number;
    status: string;
    connectorTypeId: number;
    stationId: number;
    powerOutput: number;
    pricePerKwh: number;
    typeName?: string; // Add typeName for backward compatibility
    connectorType?: {
        connectorTypeId: number;
        typeName: string;
        powerOutput: number;
        pricePerKwh: number;
    } | undefined;
    station?: {
        stationId: number;
        stationName: string;
        address: string;
        status: string;
        latitude: number;
        longitude: number;
        chargingPoint: any;
        chargingPointNumber: number;
    } | undefined;
}

interface ChargingStation {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    status: StationStatus;
    totalPoints: number;
    availablePoints: number;
    connectorTypes: ConnectorType[];
    chargingPoints?: ChargingPoint[];
    chargingPointNumber?: number;
    pricing: {
        standard: number;
        fast: number;
        rapid: number;
    };
    operatingHours: string;
    contactPhone: string;
    contactEmail: string;
    lastMAINTENANCE: string;
    nextMAINTENANCE: string;
    revenue: {
        daily: number;
        monthly: number;
    };
    // API fields
    stationId?: string;
    stationName?: string;
    numberOfPort?: number;
}

interface newPortType {
    connectorId: string,
    name: string,
    power: number,
    price: number
}

interface PortType {
    connectorId?: string,
    name: string,
    power: string,
    price: string
}

interface AdminMapViewProps {
    onBack: () => void;
}

// Helper to ensure a station object is safe for rendering
function sanitizeStation(raw: any): ChargingStation {
    const safeConnectorTypes: ConnectorType[] = Array.isArray(raw.connectorTypes)
        ? raw.connectorTypes.map((c: any) => ({
            type: String(c?.type ?? "Unknown"),
            available: Number(c?.available ?? 0),
            total: Math.max(1, Number(c?.total ?? 1)), // avoid divide-by-zero
            power: String(c?.power ?? "")
        }))
        : [{ type: "Unknown", available: 0, total: 1, power: "0kW" }];

    // Process charging points if available
    const safeChargingPoints: ChargingPoint[] = Array.isArray(raw.chargingPoints)
        ? raw.chargingPoints.map((point: any, index: number) => {
            console.log(`Processing charging point ${index}:`, point);
            
            // Ưu tiên lấy từ connectorType trước
            const connectorType = point.connectorType || {};
            const typeName = connectorType.typeName || point.typeName || "Unknown";
            const powerOutput = connectorType.powerOutput || point.powerOutput || 0;
            const pricePerKwh = connectorType.pricePerKWh || point.pricePerKwh || 0;
            
            console.log(`Point ${index} extracted from connectorType:`, {
                typeName,
                powerOutput,
                pricePerKwh,
                status: point.status
            });
            
            return {
                chargingPointId: Number(point.chargingPointId ?? 0),
                typeName: String(typeName),
                status: String(point.status ?? "OUT_OF_SERVICE"),
                powerOutput: Number(powerOutput),
                pricePerKwh: Number(pricePerKwh),
                station: point.station ? {
                    stationId: Number(point.station.stationId ?? 0),
                    stationName: String(point.station.stationName ?? ""),
                    address: String(point.station.address ?? ""),
                    status: String(point.station.status ?? "INACTIVE"),
                    latitude: Number(point.station.latitude ?? 0),
                    longitude: Number(point.station.longitude ?? 0),
                    chargingPoint: point.station.chargingPoint,
                    chargingPointNumber: Number(point.station.chargingPointNumber ?? 0)
                } : undefined
            };
        })
        : [];

    const totalPoints = Number(raw.numberOfPort ?? raw.totalPoints ?? raw.chargingPointNumber ?? 0);
    const availablePoints = Number(raw.availablePoints ?? totalPoints);

    const lat = Number(raw.latitude ?? 0);
    const lng = Number(raw.longitude ?? 0);

    return {
        id: String(raw.stationId ?? raw.id ?? `ST${Date.now()}`),
        name: String(raw.stationName ?? raw.name ?? "New Station"),
        address: String(raw.address ?? ""),
        latitude: isFinite(lat) ? lat : 0,
        longitude: isFinite(lng) ? lng : 0,
        status: (String(raw.status ?? "INACTIVE").toUpperCase() as StationStatus),
        totalPoints: isFinite(totalPoints) ? totalPoints : 0,
        availablePoints: isFinite(availablePoints) ? availablePoints : 0,
        connectorTypes: safeConnectorTypes,
        chargingPoints: safeChargingPoints,
        chargingPointNumber: Number(raw.chargingPointNumber ?? safeChargingPoints.length),
        pricing: {
            standard: Number(raw.pricing?.standard ?? 0),
            fast: Number(raw.pricing?.fast ?? 0),
            rapid: Number(raw.pricing?.rapid ?? 0)
        },
        operatingHours: String(raw.operatingHours ?? "24/7"),
        contactPhone: String(raw.contactPhone ?? ""),
        contactEmail: String(raw.contactEmail ?? ""),
        lastMAINTENANCE: String(raw.lastMAINTENANCE ?? new Date().toISOString().split("T")[0]),
        nextMAINTENANCE: String(raw.nextMAINTENANCE ?? new Date().toISOString().split("T")[0]),
        revenue: {
            daily: Number(raw.revenue?.daily ?? 0),
            monthly: Number(raw.revenue?.monthly ?? 0)
        }
    };
}

export default function AdminMapView({ onBack }: AdminMapViewProps) {
    const [selectedStation, setSelectedStation] = useState<ChargingStation | null>(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleteConnectorDialogOpen, setIsDeleteConnectorDialogOpen] = useState(false);
    const [connectorToDelete, setConnectorToDelete] = useState<{ id: string; name: string } | null>(null);
    const [carModels, setCarModels] = useState<Array<{ carModelId: number; brand: string; model: string; connectorTypeId: number }>>([]);
    const [isCarModelsLoading, setIsCarModelsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [mapCenter, setMapCenter] = useState({ lat: 10.7769, lng: 106.7009 });
    const [mapZoom, setMapZoom] = useState(13);
    const [selectedStationPopup, setSelectedStationPopup] = useState<ChargingStation | null>(null);

    // Form state
    const [address, setAddress] = useState("");
    const [stationName, setStationName] = useState("");
    const [status, setStatus] = useState<StationStatus>("INACTIVE");
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Charging posts management
    const [chargingPosts, setChargingPosts] = useState<Array<{
        id: string;
        connectorType: string;
        power: string;
        price: string;
        status: string;
    }>>([]);
    const [poiList, setPoiList] = useState<Array<{ id: string; name: string; address: string; longitude: number; latitude: number }>>([]);
    const poiListRef = useRef<Array<{ id: string; name: string; address: string; longitude: number; latitude: number }>>([]);
    useEffect(() => { poiListRef.current = poiList; }, [poiList]);

    // Debug address state changes
    useEffect(() => {
        console.log("Address state changed:", address);
    }, [address]);
    const [stations, setStations] = useState<ChargingStation[]>([]);
    const [newPortTypes, setNewPortTypes] = useState<newPortType[]>([]);
    const [allChargingPoints, setAllChargingPoints] = useState<ChargingPoint[]>([]);
    const [isAllChargingPointsDialogOpen, setIsAllChargingPointsDialogOpen] = useState(false);
    const [selectedStationForAllPoints, setSelectedStationForAllPoints] = useState<ChargingStation | null>(null);


    // Search state
    const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; address: string; longitude: number; latitude: number }>>([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [searchInput, setSearchInput] = useState("");

    // Address search state for edit form
    const [addressSearchResults, setAddressSearchResults] = useState<Array<{ id: string; name: string; address: string; longitude: number; latitude: number }>>([]);
    const [showAddressSearchResults, setShowAddressSearchResults] = useState(false);
    const [addressSearchInput, setAddressSearchInput] = useState("");
    const [isAddressFieldTouched, setIsAddressFieldTouched] = useState(false);
    const [selectedPOI, setSelectedPOI] = useState<{ id: string; name: string; address: string; longitude: number; latitude: number } | null>(null);
    const [tempMarker, setTempMarker] = useState<maptilersdk.Marker | null>(null);

    // Charging port types management
    const [showPortTypesPopup, setShowPortTypesPopup] = useState(false);
    const [showAddPortTypePopup, setShowAddPortTypePopup] = useState(false);
    const [newPortType, setNewPortType] = useState({
        name: "",
        power: "",
        price: ""
    });

    const [portTypes, setPortTypes] = useState<PortType[]>([]);

    // Map to track markers by station ID
    const markerMapRef = useRef<Map<string, maptilersdk.Marker>>(new Map());

    // ========= API =========

    const handleStationAdding = async (): Promise<ChargingStation | null> => {
        setLoading(true);
        setError(null);

        try {
            const payload = {
                stationName: stationName.trim(),
                address: address.trim(),
                status: (status || "INACTIVE").toUpperCase() as StationStatus,
                latitude: Number(latitude),
                longitude: Number(longitude),
                chargingPointNumber: chargingPosts.length,
                chargingPoints: chargingPosts.map(post => ({
                    status: post.status,
                    typeName: post.connectorType
                }))
            };

            const res = await axios.post(
                "http://localhost:8080/api/charging-stations",
                payload,
            );

            if (res.status === 200 || res.status === 201) {
                toast.success("Tạo trạm thành công");
                return sanitizeStation({
                    ...res.data,
                    stationId: res.data?.stationId ?? undefined,
                    stationName: res.data?.stationName ?? payload.stationName,
                    address: res.data?.address ?? payload.address,
                    latitude: res.data?.latitude ?? payload.latitude,
                    longitude: res.data?.longitude ?? payload.longitude,
                    numberOfPort: res.data?.numberOfPort ?? chargingPosts.length,
                    status: res.data?.status ?? payload.status,
                });
            }

            throw new Error("Tạo trạm thất bại");
        } catch (err: any) {
            const msg = err?.response?.data?.message || "Tạo trạm thất bại. Vui lòng thử lại.";
            setError(msg);
            toast.error(msg);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const fetchChargingStations = async (): Promise<ChargingStation[] | null> => {
        try {
            const res = await axios.get("http://localhost:8080/api/charging-stations",);

            if (res.status === 200) {
                console.log("API Response:", res.data);
                return (res.data as any[]).map(station => sanitizeStation({
                    id: station.stationId,
                    stationName: station.stationName,
                    address: station.address,
                    latitude: station.latitude,
                    longitude: station.longitude,
                    numberOfPort: station.numberOfPort,
                    status: station.status,
                    chargingPoints: station.chargingPoints,
                    chargingPointNumber: station.chargingPointNumber,
                })) as ChargingStation[];
            }

            throw new Error("Không thể lấy danh sách trạm sạc");
        } catch (err: any) {
            const msg =
                err?.response?.data?.message || "Lấy danh sách trạm thất bại. Vui lòng thử lại.";
            toast.error(msg);
            return null;
        }
    };

    const fetchChargingPoints = async (): Promise<ChargingPoint[] | null> => {
        try {
            const res = await axios.get("http://localhost:8080/api/charging-points",);

            if (res.status === 200) {
                console.log("Charging Points API Response:", res.data);
                return res.data as ChargingPoint[];
            }

            throw new Error("Không thể lấy danh sách trụ sạc");
        } catch (err: any) {
            const msg =
                err?.response?.data?.message || "Lấy danh sách trụ sạc thất bại. Vui lòng thử lại.";
            toast.error(msg);
            return null;
        }
    };
    const handleGetStationList = async () => {
        try {
            const list = await fetchChargingStations();
            if (list) {
                // Fetch complete station details using fetchChargingPointsByStationId for each station
                const stationsWithCompleteDetails = await Promise.all(
                    list.map(async (station) => {
                        try {
                            // Use fetchChargingPointsByStationId to get complete station data with connector types
                            const detailedStation = await fetchChargingPointsByStationId(station.id);
                            if (detailedStation) {
                                return detailedStation;
                            }
                            // Fallback to original station if detailed fetch fails
                            return station;
                        } catch (error) {
                            console.error(`Error fetching details for station ${station.id}:`, error);
                            return station;
                        }
                    })
                );

                setStations(stationsWithCompleteDetails);
                console.log("Station List with Complete Details: ", stationsWithCompleteDetails);
            } else {
                console.warn("Can not receive the station list");
            }
        } catch (err) {
            console.error("Error for calling API: ", err);
        }
    };

    const fetchConnectorTypes = async (): Promise<newPortType[] | null> => {
        try {
            const res = await axios.get("http://localhost:8080/api/connector-types");

            if (res.status === 200) {
                console.log("Connector Types API Response:", res.data);
                return (res.data as any[]).map(connector => ({
                    connectorId: connector.connectorTypeId || connector.connectorId,
                    name: connector.typeName || connector.name,
                    power: connector.powerOutput || connector.power,
                    price: connector.pricePerKwh || connector.price
                })) as newPortType[];
            }

            throw new Error("Không thể lấy danh sách loại cổng sạc");
        } catch (err: any) {
            console.error("Error fetching connector types:", err);
            const msg =
                err?.response?.data?.message || "Lấy danh sách loại cổng sạc thất bại. Vui lòng thử lại.";
            toast.error(msg);
            return null;
        }
    };

    const fetchCarModels = async (): Promise<Array<{ carModelId: number; brand: string; model: string; connectorTypeId: number }> | null> => {
        if (isCarModelsLoading) return null;
        
        setIsCarModelsLoading(true);
        try {
            const res = await axios.get("http://localhost:8080/api/carModel");
            
            if (res.status === 200 && res.data.success) {
                console.log("Car Models API Response:", res.data);
                // Filter out invalid entries (where brand or model is null)
                const validModels = res.data.data.filter((model: any) => 
                    model.brand && model.model && model.brand !== null && model.model !== null
                );
                
                const carModelsData = validModels.map((model: any) => ({
                    carModelId: model.carModelId,
                    brand: model.brand,
                    model: model.model,
                    connectorTypeId: model.connectorTypeIds?.[0] || 0 // Take first connector type ID
                }));
                
                setCarModels(carModelsData);
                return carModelsData;
            }
            
            return null;
        } catch (err: any) {
            console.error("Error fetching car models:", err);
            return null;
        } finally {
            setIsCarModelsLoading(false);
        }
    };

    // Function to fetch specific connector type details by ID
    const fetchConnectorTypeById = async (connectorTypeId: number): Promise<any | null> => {
        try {
            const res = await axios.get(`http://localhost:8080/api/connector-types/${connectorTypeId}`);

            if (res.status === 200) {
                console.log("Connector Type Details API Response:", res.data);
                return {
                    connectorTypeId: res.data.connectorTypeId,
                    typeName: res.data.typeName,
                    powerOutput: res.data.powerOutput,
                    pricePerKwh: res.data.pricePerKwh,
                    vehicles: res.data.vehicles || []
                };
            }

            throw new Error("Không thể lấy thông tin chi tiết loại cổng sạc");
        } catch (err: any) {
            console.error("Error fetching connector type details:", err);
            const msg =
                err?.response?.data?.message || "Lấy thông tin chi tiết loại cổng sạc thất bại. Vui lòng thử lại.";
            toast.error(msg);
            return null;
        }
    };
    const handleGetConnectorList = async () => {
        try {
            const list = await fetchConnectorTypes();
            if (list) {
                setPortTypes(list.map(connector => ({
                    connectorId: connector.connectorId,
                    name: connector.name,
                    power: connector.power.toString(),
                    price: connector.price.toString()
                })));
                console.log("Connector type List: ", list);
            } else {
                console.warn("Can not receive the connector type list");
            }
        } catch (err) {
            console.error("Error for calling API: ", err);
        }
    };


    // Fetch stations on component mount
    useEffect(() => {
        handleGetStationList();
        fetchMapTilerPOIs();
        handleGetConnectorList();
        fetchCarModels();
    }, []);

    // Đảm bảo search control hiển thị sau khi map load
    useEffect(() => {
        if (__mapRef.current && __mapRef.current.loaded()) {
            // Kiểm tra và đảm bảo search control hiển thị
            setTimeout(() => {
                const geocoderElement = document.querySelector('.maplibregl-ctrl-geocoder') as HTMLElement;
                const customSearchElement = document.querySelector('.custom-search-control') as HTMLElement;

                if (geocoderElement) {
                    geocoderElement.style.display = 'block';
                    geocoderElement.style.visibility = 'visible';
                    geocoderElement.style.opacity = '1';
                    geocoderElement.style.zIndex = '1000';
                    console.log("GeocodingControl đã được đảm bảo hiển thị");
                } else if (customSearchElement) {
                    customSearchElement.style.display = 'block';
                    customSearchElement.style.visibility = 'visible';
                    customSearchElement.style.opacity = '1';
                    customSearchElement.style.zIndex = '1000';
                    console.log("Custom search control đã được đảm bảo hiển thị");
                } else {
                    console.warn("Không tìm thấy search control nào");
                }
            }, 1000);
        }
    }, [stations, poiList]);

    const callApiForStationUpdating = async (stationId: string): Promise<ChargingStation | null> => {
        setLoading(true);
        setError(null);

        try {
            const payload = {
                stationId: Number(stationId),
                stationName: stationName.trim(),
                address: address.trim(),
                status: (status || "INACTIVE").toUpperCase(),
                latitude: Number(latitude),
                longitude: Number(longitude),
                chargingPointNumber: chargingPosts.length,
                chargingPoints: chargingPosts.map(post => {
                    // Find the connector type ID from newPortTypes
                    const connectorType = newPortTypes.find(type => type.name === post.connectorType);
                    return {
                        charingPointId: Number(post.id.replace('post-', '')), // Extract ID from post ID
                        status: post.status,
                        connector_type_id: connectorType?.connectorId || 1, // Use actual connector type ID
                        kWh: Number(post.power)
                    };
                })
            };

            const res = await axios.put(
                `http://localhost:8080/api/charging-stations/${stationId}`,
                payload,
            );

            if (res.status === 200 || res.status === 201) {
                toast.success("Cập nhật thành công");
                return sanitizeStation({
                    ...res.data,
                    stationId: res.data?.stationId ?? undefined,
                    stationName: res.data?.stationName ?? payload.stationName,
                    address: res.data?.address ?? payload.address,
                    latitude: res.data?.latitude ?? payload.latitude,
                    longitude: res.data?.longitude ?? payload.longitude,
                });
            }

            throw new Error("Cập nhật thất bại");
        } catch (err: any) {
            const msg = err?.response?.data?.message || "Cập nhật thất bại. Vui lòng thử lại.";
            setError(msg);
            toast.error(msg);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const callApiForStationDeleting = async (stationId: string): Promise<boolean> => {
        setLoading(true);
        setError(null);

        try {
            const res = await axios.delete(
                `http://localhost:8080/api/charging-stations/${stationId}`,
            );

            if (res.status === 200 || res.status === 204) {
                toast.success("Xóa trạm sạc thành công");
                return true;
            }

            throw new Error("Xóa trạm sạc thất bại");
        } catch (err: unknown) {
            const msg =
                err instanceof AxiosError && err.response?.data?.message
                    ? err.response.data.message
                    : "Xóa trạm sạc thất bại. Vui lòng thử lại.";
            setError(msg);
            toast.error(msg);
            return false;
        } finally {
            setLoading(false);
        }
    };
    const callApiForConnectorDeleting = async (connectorId: string): Promise<boolean> => {
        setLoading(true);
        setError(null);

        try {
            const res = await axios.delete(
                `http://localhost:8080/api/connector-types/${connectorId}`,
            );

            if (res.status === 200 || res.status === 204) {
                toast.success("Xóa cổng sạc thành công");
                return true;
            }

            throw new Error("Xóa cổng sạc thất bại");
        } catch (err: unknown) {
            const msg =
                err instanceof AxiosError && err.response?.data?.message
                    ? err.response.data.message
                    : "Xóa cổng sạc thất bại. Vui lòng thử lại.";
            setError(msg);
            toast.error(msg);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const callApiForConnectorAdding = async (): Promise<newPortType | null> => {
        setLoading(true);
        setError(null);
        try {
            const payload = {
                typeName: newPortType.name.trim(),
                powerOutput: Number(newPortType.power),
                pricePerKwh: Number(newPortType.price)
            };

            const res = await axios.post(
                "http://localhost:8080/api/connector-types",
                payload,
            );

            if (res.status === 200 || res.status === 201) {
                toast.success("Thêm loại cổng sạc thành công");
                return {
                    connectorId: res.data.connectorTypeId,
                    name: res.data?.typeName ?? payload.typeName,
                    power: res.data?.powerOutput ?? payload.powerOutput,
                    price: res.data?.pricePerKwh ?? payload.pricePerKwh
                };
            }

            throw new Error("Thêm loại cổng sạc thất bại");
        } catch (err: any) {
            const msg = err?.response?.data?.message || "Thêm loại cổng sạc thất bại. Vui lòng thử lại.";
            setError(msg);
            toast.error(msg);
            return null;
        } finally {
            setLoading(false);
        }
    }
    // ========= HẾT API =========

    // ========= SEARCH FUNCTIONS =========

    const handleSearchPOI = (query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        const searchTerm = query.toLowerCase().trim();

        // Tìm kiếm thông minh với scoring
        const results = poiList
            .map(poi => {
                const name = poi.name.toLowerCase();
                const address = poi.address.toLowerCase();
                let score = 0;

                // Exact match trong tên (score cao nhất)
                if (name === searchTerm) score += 100;
                else if (name.startsWith(searchTerm)) score += 80;
                else if (name.includes(searchTerm)) score += 60;

                // Exact match trong địa chỉ
                if (address === searchTerm) score += 50;
                else if (address.startsWith(searchTerm)) score += 40;
                else if (address.includes(searchTerm)) score += 30;

                // Tìm kiếm từng từ riêng lẻ
                const searchWords = searchTerm.split(' ').filter(word => word.length > 0);
                const nameWords = name.split(' ');
                const addressWords = address.split(' ');

                searchWords.forEach(word => {
                    if (nameWords.some(nw => nw.startsWith(word))) score += 20;
                    if (addressWords.some(aw => aw.startsWith(word))) score += 15;
                });

                return { ...poi, score };
            })
            .filter(poi => poi.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8); // Giới hạn 8 kết quả tốt nhất

        setSearchResults(results);
        setShowSearchResults(true);
    };

    const handleSelectPOI = async (poi: { id: string; name: string; address: string; longitude: number; latitude: number }) => {
        console.log("🎯 Zoom to POI:", poi.name, "at", poi.longitude, poi.latitude);

        // Xóa marker tạm cũ nếu có
        if (tempMarker) {
            tempMarker.remove();
        }

        // Di chuyển bản đồ đến vị trí POI với animation mượt mà
        if (__mapRef.current) {
            __mapRef.current.flyTo({
                center: [poi.longitude, poi.latitude],
                zoom: 16,
                duration: 1500,
                essential: true
            });

            // Tạo marker tạm tại vị trí POI
            const markerElement = document.createElement("div");
            markerElement.className = "relative";
            markerElement.innerHTML = `
                <div class="w-8 h-8 rounded-full border-4 border-white shadow-2xl flex items-center justify-center animate-pulse" style="background-color:#3b82f6">
                    <div class="w-3 h-3 bg-white rounded-full"></div>
                </div>
                <div class="absolute top-10 left-1/2 -translate-x-1/2 bg-black border border-gray-600 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap shadow-xl text-white">
                    ${poi.name}
                </div>
            `;
            markerElement.style.cursor = "pointer";

            const newTempMarker = new maptilersdk.Marker({ element: markerElement, anchor: "bottom" })
                .setLngLat([poi.longitude, poi.latitude])
                .addTo(__mapRef.current);

            setTempMarker(newTempMarker);
        }

        // Thử lấy địa chỉ chi tiết từ bản đồ cho POI được chọn
        let enhancedPOI = { ...poi };
        try {
            console.log("🔍 Đang lấy địa chỉ chi tiết cho POI:", poi.name);
            const detailedAddress = await getDetailedAddress(poi.longitude, poi.latitude, { name: poi.name });

            if (detailedAddress && detailedAddress.length > poi.address.length) {
                enhancedPOI = { ...poi, address: detailedAddress };
                console.log("✅ Địa chỉ đã được cải thiện:", detailedAddress);
            } else {
                console.log("ℹ️ Giữ nguyên địa chỉ hiện tại:", poi.address);
            }
        } catch (error) {
            console.warn("⚠️ Không thể lấy địa chỉ chi tiết:", error);
        }

        // Lưu POI được chọn (có thể đã được cải thiện địa chỉ)
        setSelectedPOI(enhancedPOI);

        // Đóng kết quả tìm kiếm với animation
        setTimeout(() => {
            setShowSearchResults(false);
            setSearchInput("");
        }, 200);

        // Toast notification với thông tin chi tiết
        toast.success("Đã tìm thấy vị trí", {
            description: `${enhancedPOI.name}`,
            duration: 3000,
        });
    };

    // Debounce search để tối ưu hiệu suất
    const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

    const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchInput(value);

        // Clear timeout cũ
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // Debounce search với 300ms
        const newTimeout = setTimeout(() => {
            handleSearchPOI(value);
        }, 300);

        setSearchTimeout(newTimeout);
    };

    // Đóng dropdown khi click bên ngoài
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.group')) {
                setShowSearchResults(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Cleanup timeout khi component unmount
    useEffect(() => {
        return () => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
        };
    }, [searchTimeout]);

    // Đóng address search dropdown khi click bên ngoài
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.address-search-results-container') && !target.closest('#editAddress')) {
                setShowAddressSearchResults(false);
            }
            if (!target.closest('.port-types-popup-container')) {
                setShowPortTypesPopup(false);
            }
            if (!target.closest('.add-port-type-popup-container')) {
                setShowAddPortTypePopup(false);
            }
        };

        if (showAddressSearchResults || showPortTypesPopup || showAddPortTypePopup) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showAddressSearchResults, showPortTypesPopup, showAddPortTypePopup]);

    // ========= STATION STATUS UPDATE FUNCTION =========

    const updateStationStatus = async (stationId: string, status: "ACTIVE" | "INACTIVE"): Promise<boolean> => {
        setLoading(true);
        setError(null);

        try {
            const res = await axios.patch(
                `http://localhost:8080/api/charging-stations/${stationId}/status`,
                status,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (res.status === 200 || res.status === 201) {
                const statusText = status === "ACTIVE" ? "kích hoạt" : "vô hiệu hóa";
                toast.success(`Cập nhật trạng thái trạm sạc thành công - ${statusText}`);
                return true;
            }

            throw new Error("Cập nhật trạng thái thất bại");
        } catch (err: unknown) {
            const msg =
                err instanceof AxiosError && err.response?.data?.message
                    ? err.response.data.message
                    : "Cập nhật trạng thái trạm sạc thất bại. Vui lòng thử lại.";
            setError(msg);
            toast.error(msg);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // ========= CHARGING POSTS MANAGEMENT FUNCTIONS =========

    const addChargingPost = () => {
        const newPost = {
            id: `post_${Date.now()}`,
            connectorType: "",
            power: "",
            price: "",
            status: "AVAILABLE"
        };
        setChargingPosts(prev => [...prev, newPost]);
    };

    const removeChargingPost = (id: string) => {
        setChargingPosts(prev => prev.filter(post => post.id !== id));
    };

    const updateChargingPost = (id: string, field: string, value: string) => {
        setChargingPosts(prev => prev.map(post =>
            post.id === id ? { ...post, [field]: value } : post
        ));
    };


    const fetchChargingPointsByStationId = async (stationId: string): Promise<ChargingStation | null> => {
        try {
            const res = await axios.get(`http://localhost:8080/api/charging-points/station/${stationId}`);
            
            if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
                console.log("Charging Points by Station ID API Response:", res.data);
                
                // Get station info from the first charging point's station data
                const firstPoint = res.data[0];
                const stationData = firstPoint.station;
                
                // Calculate available and total points
                const totalPoints = res.data.length;
                const availablePoints = res.data.filter(point => point.status === 'AVAILABLE').length;
                
                // Process connector types from charging points
                const connectorTypesMap = new Map<string, ConnectorType>();
                
                res.data.forEach((point: any) => {
                    const connectorType = point.connectorType;
                    const typeName = connectorType?.typeName || 'Unknown';
                    const existing = connectorTypesMap.get(typeName);
                    
                    if (existing) {
                        existing.total += 1;
                        if (point.status === 'AVAILABLE') {
                            existing.available += 1;
                        }
                    } else {
                        connectorTypesMap.set(typeName, {
                            type: typeName,
                            available: point.status === 'AVAILABLE' ? 1 : 0,
                            total: 1,
                            power: `${connectorType?.powerOutput || 0}kW`,
                            connectorTypeId: connectorType?.connectorTypeId,
                            typeName: typeName,
                            powerOutput: connectorType?.powerOutput,
                            pricePerKwh: connectorType?.pricePerKwh
                        });
                    }
                });
                
                const connectorTypes = Array.from(connectorTypesMap.values());
                
                // Map charging points to the expected format
                const chargingPoints: ChargingPoint[] = res.data.map((point: any) => ({
                    chargingPointId: point.chargingPointId,
                    status: point.status,
                    connectorTypeId: point.connectorTypeId,
                    stationId: point.stationId,
                    powerOutput: point.connectorType?.powerOutput || point.powerOutput || 0,
                    pricePerKwh: point.connectorType?.pricePerKWh || point.pricePerKwh || 0,
                    typeName: point.connectorType?.typeName,
                    connectorType: point.connectorType ? {
                        connectorTypeId: point.connectorType.connectorTypeId,
                        typeName: point.connectorType.typeName,
                        powerOutput: point.connectorType.powerOutput,
                        pricePerKwh: point.connectorType.pricePerKwh
                    } : undefined,
                    station: point.station ? {
                        stationId: point.station.stationId,
                        stationName: point.station.stationName,
                        address: point.station.address,
                        status: point.station.status,
                        latitude: point.station.latitude,
                        longitude: point.station.longitude,
                        chargingPoint: point.station.chargingPoint,
                        chargingPointNumber: point.station.chargingPointNumber
                    } : undefined
                }));
                
                // Create the station object with all details
                const station: ChargingStation = {
                    id: String(stationData.stationId || stationId),
                    name: stationData.stationName || 'Unknown Station',
                    address: stationData.address || '',
                    latitude: stationData.latitude || 0,
                    longitude: stationData.longitude || 0,
                    status: stationData.status || 'INACTIVE',
                    totalPoints: totalPoints,
                    availablePoints: availablePoints,
                    connectorTypes: connectorTypes,
                    chargingPoints: chargingPoints,
                    chargingPointNumber: stationData.chargingPointNumber || totalPoints,
                    pricing: {
                        standard: 0,
                        fast: 0,
                        rapid: 0
                    },
                    operatingHours: '24/7',
                    contactPhone: '',
                    contactEmail: '',
                    lastMAINTENANCE: '',
                    nextMAINTENANCE: '',
                    revenue: {
                        daily: 0,
                        monthly: 0
                    }
                };
                
                return station;
            }
            
            throw new Error("Không thể lấy thông tin trạm sạc");
        } catch (err: any) {
            const msg = err?.response?.data?.message || "Lấy thông tin trạm sạc thất bại. Vui lòng thử lại.";
            console.error("Error fetching charging points by station ID:", err);
            toast.error(msg);
            return null;
        }
    }

    // ========= PORT TYPE MANAGEMENT FUNCTIONS =========

    const handleAddPortType = async () => {
        if (!newPortType.name.trim() || !newPortType.power.trim() || !newPortType.price.trim()) {
            toast.error("Vui lòng điền đầy đủ thông tin");
            return;
        }

        try {
            const result = await callApiForConnectorAdding();
            if (result) {
                const newPortTypeData = {
                    name: result.name,
                    power: result.power.toString(),
                    price: result.price.toString()
                };

                setPortTypes(prev => [...prev, newPortTypeData]);
                setNewPortType({ name: "", power: "", price: "" });
                setShowAddPortTypePopup(false);
            }
        } catch (error) {
            console.error("Error adding port type:", error);
        }
    };

    const handleCancelAddPortType = () => {
        setNewPortType({ name: "", power: "", price: "" });
        setShowAddPortTypePopup(false);
    };

    // ========= ADDRESS SEARCH FUNCTIONS FOR EDIT FORM =========

    const handleAddressSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAddressSearchInput(value);
        setIsAddressFieldTouched(true); // Đánh dấu đã tương tác với field

        // Clear timeout if exists
        if (addressSearchTimeout) {
            clearTimeout(addressSearchTimeout);
        }

        // Set new timeout
        const timeout = setTimeout(async () => {
            if (value.trim().length > 0) {
                handleAddressSearchPOI(value.trim());

                // Auto-geocode the address and update coordinates
                const coordinates = await geocodeAddress(value.trim());
                if (coordinates) {
                    setLatitude(coordinates.lat);
                    setLongitude(coordinates.lng);
                    setAddress(value.trim());

                    // Update marker position in real-time with new coordinates
                    if (selectedStation) {
                        const updatedStation = {
                            ...selectedStation,
                            latitude: coordinates.lat,
                            longitude: coordinates.lng,
                            address: value.trim()
                        };
                        console.log("Updating marker in real-time with geocoded coordinates:", coordinates.lat, coordinates.lng);
                        updateStationMarker(updatedStation);
                    }
                }
            } else {
                setAddressSearchResults([]);
                setShowAddressSearchResults(false);
            }
        }, 500); // Increased timeout for geocoding

        setAddressSearchTimeout(timeout);
    };

    const [addressSearchTimeout, setAddressSearchTimeout] = useState<NodeJS.Timeout | null>(null);

    const handleAddressSearchPOI = async (query: string) => {
        try {
            console.log("🔍 Searching addresses for:", query);

            // Tìm kiếm trong POI list hiện có
            const results = poiList
                .filter(poi =>
                    poi.name.toLowerCase().includes(query.toLowerCase()) ||
                    poi.address.toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 8); // Giới hạn 8 kết quả

            setAddressSearchResults(results);
            setShowAddressSearchResults(true);

            console.log(`✅ Found ${results.length} address results`);
        } catch (error) {
            console.error("❌ Address search error:", error);
            setAddressSearchResults([]);
            setShowAddressSearchResults(false);
        }
    };

    const handleSelectAddressPOI = async (poi: { id: string; name: string; address: string; longitude: number; latitude: number }) => {
        console.log("🎯 Selected address POI:", poi);

        // Cập nhật địa chỉ và tọa độ
        setAddress(poi.address);
        setLatitude(poi.latitude);
        setLongitude(poi.longitude);

        // Đóng dropdown
        setShowAddressSearchResults(false);
        setAddressSearchInput(poi.address);

        // Update marker position in real-time
        if (selectedStation) {
            const updatedStation = {
                ...selectedStation,
                latitude: poi.latitude,
                longitude: poi.longitude,
                address: poi.address
            };
            console.log("Updating marker with selected POI coordinates:", poi.latitude, poi.longitude);
            updateStationMarker(updatedStation);
        }

        // Toast notification
        toast.success("Đã cập nhật địa chỉ và tọa độ", {
            description: `${poi.name}`,
            duration: 3000,
        });
    };

    // ========= HẾT SEARCH FUNCTIONS =========

    const MAPTILER_POI_URL =
        `https://api.maptiler.com/data/0199acb6-5ff7-7e19-8995-ec24562f08ef/features.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`;

    // BBOX Việt Nam (xấp xỉ) để lọc điểm ngoài lãnh thổ
    const VN_BBOX = { minLng: 102.0, maxLng: 110.0, minLat: 8.0, maxLat: 24.5 };

    // helper: kiểm tra điểm có nằm trong bbox không
    const inBBox = (lng: number, lat: number, box = VN_BBOX) =>
        lng >= box.minLng && lng <= box.maxLng && lat >= box.minLat && lat <= box.maxLat;

    // helper: giá trị gần 0
    const nearZero = (v: number) => Math.abs(v) < 1e-4;

    // Helper: Reverse geocoding để lấy địa chỉ chi tiết từ bản đồ
    const getDetailedAddress = async (lng: number, lat: number, props: any) => {
        try {
            const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
            if (!apiKey) return null;

            // Sử dụng MapTiler Geocoding API để reverse geocoding với thông tin chi tiết
            const response = await axios.get(
                `https://api.maptiler.com/geocoding/reverse/${lng},${lat}.json?key=${apiKey}&language=vi&limit=5&types=street,locality,district,region`
            );

            const features = response.data?.features || [];
            if (features.length > 0) {
                // Tìm feature có thông tin đường phố chi tiết nhất
                const streetFeature = features.find((f: any) => f.properties?.street) || (features[0] as any);
                const context = streetFeature.context || {};

                // Lấy thông tin chi tiết từ context
                const street = streetFeature.properties?.street || "";
                const housenumber = streetFeature.properties?.housenumber || "";
                const locality = context.locality?.[0] || context.place?.[0] || "";
                const district = context.district?.[0] || context.county?.[0] || "";
                const city = context.region?.[0] || context.city?.[0] || "";
                const country = context.country?.[0] || "";

                // Tạo địa chỉ chi tiết theo format Việt Nam
                let detailedAddress = "";

                // Phần 1: Số nhà + Tên đường
                if (housenumber && street) {
                    detailedAddress = `${housenumber} ${street}`;
                } else if (street) {
                    detailedAddress = street;
                } else {
                    detailedAddress = streetFeature.properties?.name || streetFeature.properties?.label || "";
                }

                // Phường/Xã
                if (locality) {
                    detailedAddress += `, ${locality}`;
                }

                // Quận/Huyện
                if (district) {
                    detailedAddress += `, ${district}`;
                }

                // Thành phố/Tỉnh
                if (city) {
                    detailedAddress += `, ${city}`;
                }

                // Quốc gia (nếu cần)
                if (country && country !== "Việt Nam") {
                    detailedAddress += `, ${country}`;
                }

                console.log("Reverse geocoding result:", {
                    original: props.name,
                    street,
                    housenumber,
                    locality,
                    district,
                    city,
                    result: detailedAddress.trim()
                });

                return detailedAddress.trim();
            }
        } catch (error) {
            console.warn("Reverse geocoding failed:", error);
        }
        return null;
    };

    const fetchMapTilerPOIs = async () => {
        try {
            const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
            if (!apiKey) {
                console.warn("MapTiler API key not found, using mock data");
                const mockPOI = [
                    { id: "poi-1", name: "Siêu Thị Bình Hòa", address: "123 Nguyễn Huệ, Quận 1, TP.HCM", longitude: 106.6981, latitude: 10.8163 },
                    { id: "poi-2", name: "Co.opmart Nguyễn Đình Chiểu", address: "168 Nguyễn Đình Chiểu, Quận 3, TP.HCM", longitude: 106.6928, latitude: 10.7815 },
                    { id: "poi-3", name: "Mega Market An Phú", address: "Khu B, Phường An Phú, Thủ Đức, TP.HCM", longitude: 106.7422, latitude: 10.8008 }
                ];
                setPoiList(mockPOI);
                return;
            }

            const res = await axios.get(`https://api.maptiler.com/data/0199acb6-5ff7-7e19-8995-ec24562f08ef/features.json?key=${apiKey}`);
            const features = Array.isArray(res.data?.features) ? res.data.features : [];

            let skippedInvalid = 0;
            let skippedOutOfVN = 0;
            let swappedLatLng = 0;

            // lọc & chuẩn hoá toạ độ như bạn đang làm
            const candidates = features
                .filter((f: any) => {
                    // Hỗ trợ cả Point và Polygon
                    return (f?.geometry?.type === "Point" || f?.geometry?.type === "Polygon") &&
                        Array.isArray(f?.geometry?.coordinates);
                })
                .map((f: any, idx: number) => {
                    let lng, lat;

                    if (f.geometry.type === "Point") {
                        [lng, lat] = f.geometry.coordinates as [number, number];
                    } else if (f.geometry.type === "Polygon" && f.geometry.coordinates[0] && f.geometry.coordinates[0][0]) {
                        // Lấy tọa độ trung tâm của polygon
                        const coords = f.geometry.coordinates[0];
                        const center = coords.reduce((acc: number[], coord: number[]) => {
                            return [(acc[0] || 0) + (coord[0] || 0), (acc[1] || 0) + (coord[1] || 0)];
                        }, [0, 0]);
                        lng = (center[0] || 0) / coords.length;
                        lat = (center[1] || 0) / coords.length;
                    } else {
                        return null;
                    }

                    if ((lng === 0 && lat === 0) || (nearZero(lng) && nearZero(lat))) {
                        skippedInvalid++;
                        return null;
                    }
                    if (lng >= 8 && lng <= 24.8 && lat >= 102 && lat <= 110) {
                        [lng, lat] = [lat, lng];
                        swappedLatLng++;
                    }

                    const lngNum = Number(lng);
                    const latNum = Number(lat);
                    if (!inBBox(lngNum, latNum)) {
                        skippedOutOfVN++;
                        return null;
                    }

                    const props = f?.properties ?? {};

                    // Tạo địa chỉ chi tiết từ nhiều nguồn dữ liệu
                    let address = "";

                    // Phương pháp 1: Sử dụng các trường addr: chi tiết
                    if (props["addr:street"] && props["addr:housenumber"]) {
                        address = `${props["addr:housenumber"]} ${props["addr:street"]}`;
                        if (props["addr:subdistrict"]) address += `, ${props["addr:subdistrict"]}`;
                        if (props["addr:district"]) address += `, ${props["addr:district"]}`;
                        if (props["addr:city"]) address += `, ${props["addr:city"]}`;
                    }
                    // Phương pháp 2: Chỉ có tên đường
                    else if (props["addr:street"]) {
                        address = props["addr:street"];
                        if (props["addr:city"]) address += `, ${props["addr:city"]}`;
                    }
                    // Phương pháp 3: Sử dụng các trường khác
                    else if (props.address || props.addr) {
                        address = (props.address || props.addr) as string;
                    }
                    // Phương pháp 4: Sử dụng tên và mô tả
                    else if (props.name && props.description) {
                        address = `${props.name} - ${props.description}`;
                    }
                    // Phương pháp 5: Sử dụng tên và các thông tin khác
                    else if (props.name) {
                        const additionalInfo = [];
                        if (props["addr:city"]) additionalInfo.push(props["addr:city"]);
                        if (props["addr:district"]) additionalInfo.push(props["addr:district"]);
                        if (props.brand) additionalInfo.push(props.brand);
                        if (props.operator) additionalInfo.push(props.operator);

                        address = props.name;
                        if (additionalInfo.length > 0) {
                            address += ` (${additionalInfo.join(", ")})`;
                        }
                    }
                    // Phương pháp 6: Fallback cuối cùng
                    else {
                        address = props.description || "Địa chỉ chưa xác định";
                    }

                    // Làm sạch địa chỉ
                    address = address.trim().replace(/,\s*,/g, ',').replace(/,\s*$/, '');

                    // Đánh dấu POI cần reverse geocoding
                    const needsReverseGeocoding = address === "Địa chỉ chưa xác định" || address.length < 10;

                    return {
                        id: String(props.id ?? props.stationId ?? props._id ?? `poi-${idx}`),
                        name: String(props.name ?? props.title ?? "POI (chưa có trạm)"),
                        address: address,
                        longitude: lngNum,
                        latitude: latNum,
                    };
                })
                .filter(Boolean) as Array<{
                    id: string; name: string; address: string; longitude: number; latitude: number;
                }>;

            // Không vẽ POI markers nữa - đã tắt hoàn toàn
            const map = __mapRef.current;
            const drawPOIs = () => {
                // Xóa tất cả POI markers hiện có
                poiMarkersRef.current.forEach(m => m.remove());
                poiMarkersRef.current = [];
                console.log("Đã xóa tất cả POI markers");
            };

            if (map) {
                if (map.loaded()) {
                    drawPOIs();
                } else {
                    map.once("load", drawPOIs);
                }
            }
            setPoiList(candidates);

            // Xử lý reverse geocoding để lấy địa chỉ chi tiết từ bản đồ
            const improveAddresses = async () => {
                console.log("Bắt đầu cải thiện địa chỉ cho", candidates.length, "POI...");

                const improvedCandidates = await Promise.all(
                    candidates.map(async (poi, index) => {
                        try {
                            // Luôn thử reverse geocoding để lấy địa chỉ chi tiết từ bản đồ
                            const detailedAddress = await getDetailedAddress(poi.longitude, poi.latitude, { name: poi.name });

                            if (detailedAddress && detailedAddress.length > poi.address.length) {
                                console.log(`POI ${index + 1}: "${poi.name}" - Địa chỉ mới: "${detailedAddress}"`);
                                return { ...poi, address: detailedAddress };
                            } else {
                                console.log(`POI ${index + 1}: "${poi.name}" - Giữ nguyên địa chỉ: "${poi.address}"`);
                                return poi;
                            }
                        } catch (error) {
                            console.warn(`Reverse geocoding failed for POI ${index + 1}:`, poi.name, error);
                            return poi;
                        }
                    })
                );

                setPoiList(improvedCandidates);
                console.log("✅ Đã hoàn thành cải thiện địa chỉ cho tất cả POI");
            };

            // Chạy reverse geocoding trong background
            improveAddresses();

            toast.success(
                `Đã tải ${candidates.length} địa điểm từ MapTiler API. Bỏ ${skippedInvalid} vô hiệu, ${skippedOutOfVN} ngoài VN` +
                (swappedLatLng ? `, sửa ${swappedLatLng} điểm đảo lat/lng.` : ".")
            );
        } catch (err) {
            console.error("Lỗi khi fetch POI từ MapTiler:", err);
            toast.error("Không thể lấy POI từ MapTiler API");

            // Fallback to mock data on error
            const mockPOI = [
                { id: "poi-1", name: "Siêu Thị Bình Hòa", address: "123 Nguyễn Huệ, Quận 1, TP.HCM", longitude: 106.6981, latitude: 10.8163 },
                { id: "poi-2", name: "Co.opmart Nguyễn Đình Chiểu", address: "168 Nguyễn Đình Chiểu, Quận 3, TP.HCM", longitude: 106.6928, latitude: 10.7815 },
                { id: "poi-3", name: "Mega Market An Phú", address: "Khu B, Phường An Phú, Thủ Đức, TP.HCM", longitude: 106.7422, latitude: 10.8008 }
            ];
            setPoiList(mockPOI);
        }

    };



    const handleAddingStation = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!stationName.trim()) {
            const msg = "Tên trạm sạc không được để trống";
            setError(msg);
            toast.error(msg);
            return;
        }
        if (!address.trim()) {
            const msg = "Địa chỉ không được để trống";
            setError(msg);
            toast.error(msg);
            return;
        }

        if (latitude === null || Number(latitude) < -90 || Number(latitude) > 90) {
            const msg = "Vĩ độ không hợp lệ (phải nằm trong khoảng -90 đến 90)";
            setError(msg);
            toast.error(msg);
            return;
        }

        if (longitude === null || Number(longitude) < -180 || Number(longitude) > 180) {
            const msg = "Kinh độ không hợp lệ (phải nằm trong khoảng -180 đến 180)";
            setError(msg);
            toast.error(msg);
            return;
        }


        try {
            const created = await handleStationAdding();
            if (!created) return;

            // Ensure we never insert an unsafe object into state
            const safe = sanitizeStation(created);
            setStations((prev) => [safe, ...prev]);


            // Reset form
            setStationName("");
            setAddress("");
            setStatus("INACTIVE");
            setLatitude(null);
            setLongitude(null);
            setChargingPosts([]);
            setError(null);
            setIsAddDialogOpen(false);
        } catch (err) {
            console.error("Error adding station:", err);
            toast.error("Lỗi khi thêm trạm sạc. Vui lòng thử lại.");
        }
    };

    const handleUpdatingStation = async (e: React.FormEvent, stationId: string) => {
        e.preventDefault();

        // Validation
        if (!stationName.trim()) {
            const msg = "Tên trạm sạc không được để trống";
            setError(msg);
            toast.error(msg);
            return;
        }
        if (!address.trim()) {
            const msg = "Địa chỉ không được để trống";
            setError(msg);
            toast.error(msg);
            return;
        }
        // Kiểm tra vĩ độ
        if (latitude === null || Number(latitude) < -90 || Number(latitude) > 90) {
            const msg = "Vĩ độ không hợp lệ (phải nằm trong khoảng -90 đến 90)";
            setError(msg);
            toast.error(msg);
            return;
        }

        // Kiểm tra kinh độ
        if (longitude === null || Number(longitude) < -180 || Number(longitude) > 180) {
            const msg = "Kinh độ không hợp lệ (phải nằm trong khoảng -180 đến 180)";
            setError(msg);
            toast.error(msg);
            return;
        }


        // Update marker position immediately with form coordinates (before API call)
        if (selectedStation) {
            const stationWithNewCoords = {
                ...selectedStation,
                latitude: Number(latitude),
                longitude: Number(longitude),
                address: address.trim()
            };
            console.log("Updating marker immediately with form coordinates:", stationWithNewCoords.latitude, stationWithNewCoords.longitude);
            updateStationMarker(stationWithNewCoords);
        }

        try {
            const updated = await callApiForStationUpdating(stationId);
            if (!updated) return;

            // Ensure we never insert an unsafe object into state
            const safe = sanitizeStation(updated);
            setStations((prev) =>
                prev.map((station) => (station.id === safe.id ? safe : station))
            );

            // Update selected station
            setSelectedStation(safe);
            setSelectedStationPopup(safe);

            // Reset form
            setStationName("");
            setAddress("");
            setLatitude(null);
            setLongitude(null);
            setError(null);
            setIsEditDialogOpen(false);
        } catch (err) {
            console.error("Error updating station:", err);
            toast.error("Lỗi khi cập nhật trạm sạc. Vui lòng thử lại.");
        }
    };

    const handleDeletingStation = async (e: React.FormEvent, stationId: string) => {
        e.preventDefault();
        console.log("Starting deletion for station:", stationId);

        try {
            const success = await callApiForStationDeleting(stationId);
            console.log("Deletion success:", success);
            if (!success) return;

            // Update state to remove the station
            console.log("Removing station from state...");
            setStations((prev) => prev.filter((s) => s.id !== stationId));

            // Clear selected station and popup if the deleted station was selected
            if (selectedStation?.id === stationId) {
                console.log("Clearing selected station and popup...");
                setSelectedStation(null);
                setSelectedStationPopup(null);
            }

            // Remove the corresponding marker
            const marker = markerMapRef.current.get(stationId);
            if (marker) {
                console.log("Removing marker for station:", stationId);
                try {
                    marker.remove();
                } catch (err) {
                    console.error("Error removing marker:", err);
                }
                markerMapRef.current.delete(stationId);
            } else {
                console.warn("No marker found for station:", stationId);
            }

            // Close the delete dialog
            console.log("Closing delete dialog...");
            setIsDeleteDialogOpen(false);
        } catch (err) {
            console.error("Error deleting station:", err);
            toast.error("Lỗi khi xóa trạm sạc. Vui lòng thử lại.");
        }
    };

    // Check if connector type is being used by any charging posts
    const isConnectorTypeInUse = (connectorId: string): boolean => {
        // Check in all stations from API data
        const isUsedInStations = stations.some(station => {
            // Check if station has charging points with this connector type
            return station.chargingPoints?.some(point => {
                // Check if the point uses this connector type
                return point.typeName && newPortTypes.some(type =>
                    type.name === point.typeName && type.connectorId === connectorId
                );
            });
        });

        // Check in current form's charging posts
        const isUsedInForm = chargingPosts.some(post => {
            const connectorType = newPortTypes.find(type => type.name === post.connectorType);
            return connectorType?.connectorId === connectorId;
        });

        // Check in car models
        const isUsedInCarModels = carModels.some(carModel => 
            carModel.connectorTypeId === Number(connectorId)
        );

        return isUsedInStations || isUsedInForm || isUsedInCarModels;
    };

    // Get usage count information for this connector type
    const getConnectorUsageDetails = (connectorId: string): { chargingPoints: number; carModels: number } => {
        let chargingPointsCount = 0;
        let carModelsCount = 0;

        // Count charging points in all stations from API data
        stations.forEach(station => {
            station.chargingPoints?.forEach(point => {
                const connectorType = newPortTypes.find(type =>
                    type.name === point.typeName && type.connectorId === connectorId
                );
                if (connectorType) {
                    chargingPointsCount++;
                }
            });
        });

        // Count charging points in current form's charging posts
        chargingPosts.forEach((post) => {
            const connectorType = newPortTypes.find(type => type.name === post.connectorType);
            if (connectorType?.connectorId === connectorId) {
                chargingPointsCount++;
            }
        });

        // Count car models using this connector type
        carModels.forEach(carModel => {
            if (carModel.connectorTypeId === Number(connectorId)) {
                carModelsCount++;
            }
        });

        return { chargingPoints: chargingPointsCount, carModels: carModelsCount };
    };

    const handleDeletingConnectorType = (connectorId: string) => {
        console.log("Starting deletion for connector type:", connectorId);

        // Find the connector type name
        const connectorType = portTypes.find(ct => ct.connectorId === connectorId);
        if (connectorType) {
            setConnectorToDelete({ id: connectorId, name: connectorType.name });
            setIsDeleteConnectorDialogOpen(true);
        }
    };

    const confirmDeleteConnectorType = async () => {
        if (!connectorToDelete) return;

        try {
            const success = await callApiForConnectorDeleting(connectorToDelete.id);
            console.log("Deletion success:", success);
            if (!success) return;

            // Update state to remove the connector type
            console.log("Removing connector type from state...");
            setPortTypes((prev) => prev.filter((connector) => connector.connectorId !== connectorToDelete.id));

            toast.success("Xóa loại cổng sạc thành công!");
        } catch (err) {
            console.error("Error deleting connector:", err);
            toast.error("Lỗi khi xóa loại cổng sạc. Vui lòng thử lại.");
        } finally {
            setIsDeleteConnectorDialogOpen(false);
            setConnectorToDelete(null);
        }
    };

    // ========= UI helpers =========

    const getStatusIcon = (s: StationStatus) => {
        switch (s) {
            case "ACTIVE":
                return <CheckCircle className="w-4 h-4 text-green-500" />;
            case "INACTIVE":
                return <XCircle className="w-4 h-4 text-gray-500" />;
            case "MAINTENANCE":
                return <Settings className="w-4 h-4 text-yellow-500" />;
            default:
                return <XCircle className="w-4 h-4 text-red-500" />;
        }
    };

    const getStatusBadge = (s: StationStatus) => {
        const statusConfig: Record<StationStatus, { label: string; class: string }> = {
            ACTIVE: { label: "Hoạt động", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" },
            INACTIVE: { label: "Ngoại tuyến", class: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200" },
            MAINTENANCE: {
                label: "Bảo trì",
                class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
            },
        };

        return (
            <Badge variant="secondary" className={statusConfig[s]?.class}>
                {statusConfig[s]?.label}
            </Badge>
        );
    };

    const getStatusColor = (s: StationStatus) => {
        switch (s) {
            case "ACTIVE":
                return "#00ff88";
            case "INACTIVE":
                return "#ff4444";
            case "MAINTENANCE":
                return "#ffaa00";
            default:
                return "#666666";
        }
    };

    const filteredStations = stations.filter((station) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = station.name.toLowerCase().includes(q) || station.address.toLowerCase().includes(q);
        const matchesStatus = statusFilter === "all" || station.status === (statusFilter as StationStatus);
        return matchesSearch && matchesStatus;
    });

    const handleEditStation = async () => {
        if (selectedStation) {
            // First set basic info for immediate UI response
            setStationName(selectedStation.name);
            setAddress(selectedStation.address);
            setLatitude(selectedStation.latitude);
            setLongitude(selectedStation.longitude);
            setStatus(selectedStation.status);

            // Fetch complete station details using the new method
            try {
                const detailedStation = await fetchChargingPointsByStationId(selectedStation.id);
                if (detailedStation) {
                    // Update the selected station with complete details
                    setSelectedStation(detailedStation);
                    
                    // Use the detailed station data for form fields
                    setStationName(detailedStation.name);
                    setAddress(detailedStation.address);
                    setLatitude(detailedStation.latitude);
                    setLongitude(detailedStation.longitude);
                    setStatus(detailedStation.status);

                    // Load charging points from the detailed station data
                    if (detailedStation.chargingPoints && detailedStation.chargingPoints.length > 0) {
                        const existingPosts = detailedStation.chargingPoints.map((point: ChargingPoint) => ({
                            id: `post-${point.chargingPointId}`,
                            connectorType: point.typeName || point.connectorType?.typeName || "Unknown",
                            power: point.powerOutput?.toString() || "0",
                            price: point.pricePerKwh?.toString() || "0",
                            status: point.status
                        }));

                        setChargingPosts(existingPosts);
                    } else {
                        setChargingPosts([]);
                    }
                } else {
                    // If detailed fetch fails, keep original station data
                    setChargingPosts([]);
                }
            } catch (error) {
                console.error("Error fetching detailed station information:", error);
                setChargingPosts([]);
            }

            // Load port types for connector selection
            try {
                const types = await fetchConnectorTypes();
                if (types) {
                    setNewPortTypes(types);
                }
            } catch (err) {
                console.error("Error loading connector types:", err);
            }

            // Reset address field state
            setAddressSearchInput("");
            setIsAddressFieldTouched(false);
            setShowAddressSearchResults(false);
            setIsEditDialogOpen(true);
        }
    };

    const confirmDeleteStation = () => {
        if (selectedStation) {
            console.log("Confirming deletion for station:", selectedStation.id);
            handleDeletingStation({ preventDefault: () => { } } as React.FormEvent, selectedStation.id);
        }
    };


    const refreshStations = async () => {
        try {
            toast.info("Đang cập nhật dữ liệu...");
            await handleGetStationList();
            toast.success("Đã cập nhật dữ liệu trạm sạc");
        } catch (err) {
            console.error("Error refreshing stations:", err);
            toast.error("Lỗi khi làm mới dữ liệu. Vui lòng thử lại.");
        }
    };

    const handleStationClick = async (station: ChargingStation) => {
        // First set the basic station info for immediate UI response
        setSelectedStation(station);
        setSelectedStationPopup(station);
        
        // Then fetch complete station details using the new method
        try {
            const detailedStation = await fetchChargingPointsByStationId(station.id);
            if (detailedStation) {
                // Update the selected station with complete details
                setSelectedStation(detailedStation);
                setSelectedStationPopup(detailedStation);
                
                // Also update the station in the stations list
                setStations(prev => prev.map(s => 
                    s.id === station.id ? detailedStation : s
                ));
                
                console.log("Station details updated with complete information:", detailedStation);
            }
        } catch (error) {
            console.error("Error fetching detailed station information:", error);
            // Keep the original station data if fetching fails
        }
    };

    const handleViewAllChargingPoints = async (station: ChargingStation) => {
  setSelectedStationForAllPoints(station);

  // Use the already loaded charging points from the station data (no API call needed)
  if (station.chargingPoints && station.chargingPoints.length > 0) {
    setAllChargingPoints(station.chargingPoints);
    setIsAllChargingPointsDialogOpen(true);
    return;
  }

  // Fallback: If no charging points in station data, try to fetch them
  try {
    const detailedStation = await fetchChargingPointsByStationId(station.id);
    if (detailedStation && detailedStation.chargingPoints) {
      setAllChargingPoints(detailedStation.chargingPoints);
      setIsAllChargingPointsDialogOpen(true);
      return;
    }

    // Final fallback to original method
    const points = await fetchChargingPoints();
    if (!points) {
      setAllChargingPoints([]);
      setIsAllChargingPointsDialogOpen(true);
      return;
    }

    const stationIdNum = Number(station.id);

    // Lọc trụ thuộc đúng station
    const stationPointsFromAll = points.filter((p: any) => {
      const sid = p.stationId ?? p.station?.stationId ?? p.station_id;
      return Number(sid) === stationIdNum;
    });

    // Ưu tiên dùng station.chargingPoints nếu có id hợp lệ, ngược lại dùng danh sách đã lọc
    const sourcePoints: any[] =
      Array.isArray(station.chargingPoints) &&
      station.chargingPoints.some((p: any) => p?.chargingPointId ?? p?.id)
        ? station.chargingPoints
        : stationPointsFromAll;

    if (sourcePoints.length === 0) {
      console.log("No charging points found for this station");
      setAllChargingPoints([]);
      setIsAllChargingPointsDialogOpen(true);
      return;
    }

    // Các hàm tiện ích NỘI BỘ (đều khai báo trong chính hàm này):
    const getConnectorTypeId = (p: any): number | undefined => {
      return (
        p.connectorTypeId ??
        p.connector_type_id ??
        p.connectorType?.connectorTypeId ??
        p.station?.chargingPoint?.[0]?.connectorType?.connectorTypeId
      );
    };

     const extractConnectorDetail = (p: any) => {
       // 1) Ưu tiên lấy từ connectorType trực tiếp trên point (theo cấu trúc API mới)
       if (p.connectorType && (p.connectorType.typeName || p.connectorType.powerOutput)) {
         console.log("Using direct connectorType:", p.connectorType);
         return p.connectorType;
       }
       // 2) Fallback: Tìm trong station.chargingPoint khớp chargingPointId
       const cpId = p.chargingPointId ?? p.id;
       const nest = p.station?.chargingPoint;
       if (Array.isArray(nest)) {
         const found = nest.find((x: any) => (x.chargingPointId ?? x.id) === cpId);
         if (found?.connectorType) {
           console.log("Using nested connectorType:", found.connectorType);
           return found.connectorType;
         }
       }
       return undefined;
     };

    const pickPrice = (obj: any): number | null => {
      if (!obj) return null;
      if (typeof obj.pricePerKWh === "number") return obj.pricePerKWh; // dạng chuẩn trong mẫu JSON
      if (typeof obj.pricePerKwh === "number") return obj.pricePerKwh; // một số API trả khác hoa/thường
      return null;
    };

    const pickStatus = (p: any): string => {
      if (p.status) return p.status; // ưu tiên ngay trên point
      const cpId = p.chargingPointId ?? p.id;
      const found = p.station?.chargingPoint?.find((x: any) => (x.chargingPointId ?? x.id) === cpId);
      if (found?.status) return found.status;
      return "UNKNOWN";
    };

    // Cache fetch connectorType theo id để tránh gọi trùng
    const connectorTypeCache = new Map<number, any>();
    const uniqueConnectorTypeIds = Array.from(
      new Set(
        sourcePoints
          .map(getConnectorTypeId)
          .filter((id): id is number => typeof id === "number")
      )
    );

    await Promise.all(
      uniqueConnectorTypeIds.map(async (id) => {
        if (connectorTypeCache.has(id)) return;
        try {
          const det = await fetchConnectorTypeById(id);
          if (det) connectorTypeCache.set(id, det);
        } catch (e) {
          console.warn("fetchConnectorTypeById failed for id=", id, e);
        }
      })
    );

    // Chuẩn hoá từng trụ: lấy đúng powerOutput, pricePerKWh/pricePerKwh và status
    const enriched = await Promise.all(
      sourcePoints.map(async (p: any) => {
        const chargingPointId = p.chargingPointId ?? p.id;
        const status = pickStatus(p);

        const inlineConn = extractConnectorDetail(p);
        const connectorTypeId =
          getConnectorTypeId(p) ??
          inlineConn?.connectorTypeId ??
          inlineConn?.id;

        const fetchedConn =
          typeof connectorTypeId === "number"
            ? connectorTypeCache.get(connectorTypeId)
            : undefined;

        const typeName =
          p.typeName ??
          inlineConn?.typeName ??
          fetchedConn?.typeName ??
          "N/A";

         // Ưu tiên lấy từ connectorType trước, sau đó mới đến point level
         const powerOutput =
           (typeof inlineConn?.powerOutput === "number" ? inlineConn.powerOutput : null) ??
           (typeof fetchedConn?.powerOutput === "number" ? fetchedConn.powerOutput : null) ??
           (typeof p.powerOutput === "number" && p.powerOutput > 0 ? p.powerOutput : null) ??
           null;

         const pricePerKwh =
           pickPrice(inlineConn) ??
           pickPrice(fetchedConn) ??
           (typeof p.pricePerKwh === "number" ? p.pricePerKwh : null) ??
           null;

        return {
          ...p,
          chargingPointId,
          connectorTypeId,
          typeName,
          powerOutput,
          pricePerKwh,
          status,
        };
      })
    );

    // Sắp xếp cho dễ đọc
    enriched.sort((a, b) => (Number(a.chargingPointId) || 0) - (Number(b.chargingPointId) || 0));

    console.log("Enriched station points:", enriched);
    setAllChargingPoints(enriched);
    setIsAllChargingPointsDialogOpen(true);
  } catch (err) {
    console.error("Error fetching charging points:", err);
    toast.error("Lỗi khi tải danh sách trụ sạc");
  }
};



    const updateStationMarker = (station: ChargingStation) => {
        const map = __mapRef.current;
        if (!map || !map.loaded()) {
            console.log("Map not loaded, cannot update marker");
            return;
        }

        console.log("Updating marker for station:", station.id, "with coordinates:", station.longitude, station.latitude);

        try {
            // Find existing marker for this station
            const existingMarker = markerMapRef.current.get(station.id);
            console.log("Found existing marker:", !!existingMarker);

            if (existingMarker) {
                // Update existing marker position
                existingMarker.setLngLat([station.longitude, station.latitude]);
                console.log(`Updated marker position for station ${station.id} to [${station.longitude}, ${station.latitude}]`);
            } else {
                // Create new marker if it doesn't exist
                const el = document.createElement("div");
                el.className = "relative";
                el.innerHTML = `
                    <div class="w-8 h-8 bg-primary rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                        <Plug class="w-4 h-4 text-white" />
                    </div>
                `;

                const marker = new maptilersdk.Marker({ element: el, anchor: "bottom" })
                    .setLngLat([station.longitude, station.latitude])
                    .addTo(map);

                markersRef.current.push(marker);
                markerMapRef.current.set(station.id, marker);
                console.log(`Created new marker for station ${station.id} at [${station.longitude}, ${station.latitude}]`);
            }
        } catch (err) {
            console.error("Error updating station marker:", err);
        }
    };

    const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
        try {
            const response = await fetch(
                `https://api.maptiler.com/geocoding/${address}.json?key=${import.meta.env.VITE_MAPTILER_API_KEY || 'YOUR_API_KEY'}`
            );
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const [lng, lat] = data.features[0].geometry.coordinates;
                return { lat, lng };
            }
            return null;
        } catch (err) {
            console.error("Error geocoding address:", err);
            return null;
        }
    };

    // ========= Map setup =========

    const __mapRef = useRef<maptilersdk.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const markersRef = useRef<maptilersdk.Marker[]>([]);
    const poiMarkersRef = useRef<maptilersdk.Marker[]>([]);
    const defaultCenterLngLat: [number, number] = useMemo(() => [106.7009, 10.7769], []);


    const handleChargerActivate = async (stationId: string) => {
        const success = await updateStationStatus(stationId, "ACTIVE");
        if (success) {
            setStations((prev) =>
                prev.map((station) => (station.id === stationId ? {
                    ...station,
                    status: "ACTIVE" as StationStatus
                } : station))
            );

            const station = stations.find((s) => s.id === stationId);
            if (station) {
                setSelectedStation({ ...station, status: "ACTIVE" });
            }
        }
    };

    const handleChargerDeactivate = async (stationId: string) => {
        const success = await updateStationStatus(stationId, "INACTIVE");
        if (success) {
            setStations((prev) =>
                prev.map((station) =>
                    station.id === stationId
                        ? { ...station, status: "INACTIVE" as StationStatus, availablePoints: station.totalPoints }
                        : station
                )
            );

            const station = stations.find((s) => s.id === stationId);
            if (station) {
                setSelectedStation({ ...station, status: "INACTIVE", availablePoints: station.totalPoints });
            }
        }
    };

    const handleChargerRestart = (stationId: string) => {
        const station = stations.find((s) => s.id === stationId);
        if (station) {
            setStations((prev) => prev.map((s) => (s.id === stationId ? {
                ...s,
                status: "MAINTENANCE" as StationStatus
            } : s)));
            setSelectedStation({ ...station, status: "MAINTENANCE" });

            toast.info("Khởi động lại trạm sạc", {
                description: `Đang khởi động lại ${station.name}...`,
            });

            setTimeout(() => {
                setStations((prev) => prev.map((s) => (s.id === stationId ? {
                    ...s,
                    status: "ACTIVE" as StationStatus
                } : s)));
                setSelectedStation({ ...station, status: "ACTIVE" });

                toast.success("Khởi động lại hoàn tất", {
                    description: `${station.name} đã hoạt động trở lại bình thường`,
                });
            }, 3000);
        }
    };

    useEffect(() => {
        if (!mapContainerRef.current || __mapRef.current) return;

        try {
            const customStyleUrl = `https://api.maptiler.com/maps/019983ed-809a-7bba-8d9b-f5f42a71219e/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`;
            const map = new maptilersdk.Map({
                container: mapContainerRef.current,
                style: customStyleUrl,
                center: defaultCenterLngLat,
                zoom: mapZoom,
                hash: false,
            });

            __mapRef.current = map;

            // Map đã load - không cần thêm GeocodingControl nữa
            map.on('load', () => {
                console.log("Map đã load thành công");
            });


            map.on("moveend", () => {
                const z = Math.max(1, Math.min(22, map.getZoom()));
                setMapZoom(Number(z.toFixed(0)));
                const c = map.getCenter();
                setMapCenter({ lat: c.lat, lng: c.lng });

                // Không cập nhật POI markers nữa - đã tắt hoàn toàn
                // Chỉ xóa POI markers nếu có
                if (poiMarkersRef.current.length > 0) {
                    poiMarkersRef.current.forEach(m => m.remove());
                    poiMarkersRef.current = [];
                }
            });


            return () => {
                try {
                    markersRef.current.forEach((m) => m.remove());
                    poiMarkersRef.current.forEach((m) => m.remove());
                    if (tempMarker) {
                        tempMarker.remove();
                    }
                    markerMapRef.current.clear();
                    map.remove();
                    __mapRef.current = null;
                } catch (err) {
                    console.error("Error cleaning up map:", err);
                }
            };

        } catch (e) {
            console.error("Map init error:", e);
            toast.error("Không thể khởi tạo bản đồ");
        }
    }, []);

    useEffect(() => {
        const map = __mapRef.current;
        if (!map || !map.loaded()) return;

        try {
            // Clear existing markers
            markersRef.current.forEach((m) => m.remove());
            markersRef.current = [];
            markerMapRef.current.clear();

            filteredStations.forEach((station) => {
                const el = document.createElement("div");
                el.className = "relative";
                el.innerHTML = `
        <div class="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center" style="background-color:${getStatusColor(
                    station.status
                )}">
          <div class="w-2 h-2 bg-white rounded-full"></div>
        </div>
        <div class="absolute top-8 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm border border-border/50 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap shadow-lg">
          ${(station.name.split(" - ")[1] || station.name).replace(/</g, "&lt;")}
        </div>
      `;
                el.style.cursor = "pointer";
                el.addEventListener("click", () => handleStationClick(station));

                const marker = new maptilersdk.Marker({ element: el, anchor: "bottom" })
                    .setLngLat([station.longitude, station.latitude])
                    .addTo(map);

                markersRef.current.push(marker);
                markerMapRef.current.set(station.id, marker);
            });
        } catch (err) {
            console.error("Error updating markers:", err);
            toast.error("Lỗi khi cập nhật bản đồ. Vui lòng thử lại.");
        }
    }, [filteredStations]);

    useEffect(() => {
        if (!selectedStation || !__mapRef.current) return;
        try {
            __mapRef.current.easeTo({
                center: [selectedStation.longitude, selectedStation.latitude],
                zoom: Math.max(mapZoom, 14),
                duration: 600,
            });
        } catch (err) {
            console.error("Error centering map:", err);
        }
    }, [selectedStation]);

    // ========= Render =========

    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/30 p-4 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="ghost"
                                onClick={onBack}
                                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span>Quay lại</span>
                            </Button>
                            <div>
                                <h1 className="text-3xl font-semibold bg-gradient-to-r from-primary to-secondary-foreground bg-clip-text text-transparent">
                                    Quản lý Bản đồ Trạm sạc
                                </h1>
                                <p className="text-muted-foreground mt-2">Giám sát và quản lý tất cả trạm sạc trên bản
                                    đồ</p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Button variant="outline" onClick={refreshStations} className="flex items-center space-x-2">
                                <RefreshCw className="w-4 h-4" />
                                <span className="hidden sm:inline">Làm mới</span>
                            </Button>

                            {/* Charging Port Types Management Button */}
                            <div className="relative port-types-popup-container">
                                <Button
                                    variant="outline"
                                    onClick={async () => {
                                        // Ensure car models are loaded before opening popup
                                        if (carModels.length === 0) {
                                            await fetchCarModels();
                                        }
                                        setShowPortTypesPopup(!showPortTypesPopup);
                                    }}
                                    className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
                                >
                                    <Plug className="w-4 h-4" />
                                    <span className="hidden sm:inline">Loại cổng sạc</span>
                                </Button>

                                {/* Port Types Popup */}
                                {showPortTypesPopup && (
                                    <div className="absolute top-full right-0 mt-2 w-96 bg-black border border-gray-600 rounded-xl shadow-2xl z-50">
                                        {/* Header */}
                                        <div className="p-4 border-b border-gray-700">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                                                    <Plug className="w-5 h-5 text-green-400" />
                                                    <span>Quản lý loại cổng sạc</span>
                                                </h3>
                                                <button
                                                    onClick={() => setShowPortTypesPopup(false)}
                                                    className="text-gray-400 hover:text-white transition-colors"
                                                >
                                                    <XCircle className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Port Types List */}
                                        <div className="max-h-80 overflow-y-auto">
                                            {portTypes.map((portType, index) => (
                                                <div key={index} className="p-4 border-b border-gray-800 last:border-b-0 hover:bg-gray-900 transition-colors">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center space-x-2 mb-1">
                                                                <h4 className="font-medium text-white">{portType.name}</h4>
                                                                {portType.connectorId && (
                                                                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                                                                        ID: {portType.connectorId}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center space-x-4 text-sm text-gray-300">
                                                                <div className="flex items-center space-x-1">
                                                                    <Zap className="w-4 h-4 text-yellow-400" />
                                                                    <span>{portType.power} kWh</span>
                                                                </div>
                                                                <div className="flex items-center space-x-1">
                                                                    <span className="text-green-400">₫</span>
                                                                    <span>{portType.price}/kWh</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {portType.connectorId && (
                                                            <Button
                                                                onClick={() => handleDeletingConnectorType(portType.connectorId!)}
                                                                disabled={isCarModelsLoading}
                                                                className={`h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10 ${
                                                                    isCarModelsLoading ? 'opacity-50 cursor-not-allowed' : ''
                                                                }`}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Add New Port Type Button */}
                                        <div className="p-4 border-t border-gray-700">
                                            <Button
                                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                                                onClick={() => setShowAddPortTypePopup(true)}
                                            >
                                                <Plus className="w-4 h-4 mr-2" />
                                                Thêm loại cổng sạc mới
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Add New Port Type Popup */}
                            {showAddPortTypePopup && (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 add-port-type-popup-container">
                                    <div className="bg-black border border-gray-600 rounded-xl shadow-2xl w-full max-w-md mx-4">
                                        {/* Header */}
                                        <div className="p-6 border-b border-gray-700">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-xl font-semibold text-white flex items-center space-x-2">
                                                    <Plus className="w-6 h-6 text-green-400" />
                                                    <span>Thêm loại cổng sạc mới</span>
                                                </h3>
                                                <button
                                                    onClick={handleCancelAddPortType}
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors"
                                                >
                                                    <XCircle className="w-6 h-6" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Form */}
                                        <div className="p-6 space-y-4">
                                            {/* Tên cổng sạc */}
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-white">Tên cổng sạc</label>
                                                <input
                                                    type="text"
                                                    value={newPortType.name}
                                                    onChange={(e) => setNewPortType(prev => ({ ...prev, name: e.target.value }))}
                                                    placeholder="Nhập tên loại cổng sạc"
                                                    className="w-full h-12 bg-gray-900 border border-gray-600 rounded-xl px-4 text-white placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
                                                />
                                            </div>

                                            {/* Công suất */}
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-white">Công suất (kWh)</label>
                                                <input
                                                    type="number"
                                                    value={newPortType.power}
                                                    onChange={(e) => setNewPortType(prev => ({ ...prev, power: e.target.value }))}
                                                    placeholder="Nhập công suất"
                                                    className="w-full h-12 bg-gray-900 border border-gray-600 rounded-xl px-4 text-white placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
                                                />
                                            </div>

                                            {/* Giá tiền */}
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-white">Giá tiền trên mỗi kWh (₫)</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={newPortType.price}
                                                    onChange={(e) => setNewPortType(prev => ({ ...prev, price: e.target.value }))}
                                                    placeholder="Nhập giá tiền"
                                                    className="w-full h-12 bg-gray-900 border border-gray-600 rounded-xl px-4 text-white placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
                                                />
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="p-6 border-t border-gray-700 flex space-x-3">
                                            <Button
                                                variant="outline"
                                                onClick={handleCancelAddPortType}
                                                className="flex-1 h-12 border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                                            >
                                                Hủy
                                            </Button>
                                            <Button
                                                onClick={handleAddPortType}
                                                className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white"
                                            >
                                                Thêm trạm sạc
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <Dialog
                                open={isAddDialogOpen}
                                onOpenChange={(open: boolean) => {
                                    setIsAddDialogOpen(open);
                                    if (open) {
                                        // Load connector types when opening dialog
                                        handleGetConnectorList();
                                    } else {
                                        // Clear form and markers when dialog closes
                                        setStationName("");
                                        setAddress("");
                                        setStatus("INACTIVE");
                                        setLatitude(null);
                                        setLongitude(null);
                                        setChargingPosts([]);
                                        setError(null);
                                        try {
                                        } catch (err) {
                                            console.error("Error clearing click markers:", err);
                                        }
                                    }
                                }}
                            >
                                <DialogTrigger asChild>

                                </DialogTrigger>
                                <DialogContent className="max-w-4xl max-h-[30vh] overflow-y-auto">
                                    <DialogHeader className="pb-4">
                                        <DialogTitle>Thêm trạm sạc mới</DialogTitle>
                                        <DialogDescription>Nhập thông tin cơ bản để tạo trạm sạc mới trong hệ thống</DialogDescription>
                                    </DialogHeader>

                                    <form onSubmit={handleAddingStation} className="space-y-4">
                                        <ScrollArea className="max-h-[calc(90vh-200px)] pr-2">
                                            {error &&
                                                <div className="text-red-600 text-sm p-2 bg-red-50 rounded">{error}</div>}
                                            <div>
                                                <Label htmlFor="name">Tên trạm sạc</Label>
                                                <Input
                                                    id="name"
                                                    placeholder="ChargeHub Premium - Q1"
                                                    value={stationName}
                                                    onChange={(e) => setStationName(e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>

                                            <div>
                                                <Label htmlFor="address">Địa chỉ</Label>
                                                <Textarea
                                                    id="address"
                                                    placeholder="123 Nguyễn Huệ, Quận 1, TP.HCM"
                                                    value={address}
                                                    onChange={(e) => {
                                                        console.log("Address input changed:", e.target.value);
                                                        setAddress(e.target.value);
                                                    }}
                                                    disabled={loading}
                                                />
                                            </div>

                                            <div>
                                                <Label htmlFor="status">Trạng thái</Label>
                                                <Select value={status} onValueChange={(v: string) => setStatus(v as StationStatus)}
                                                    disabled={loading}>
                                                    <SelectTrigger id="status">
                                                        <SelectValue placeholder="Chọn trạng thái" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                                                        <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                                                        <SelectItem value="MAINTENANCE">MAINTENANCE</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <Label htmlFor="latitude">Vĩ độ</Label>
                                                    <Input
                                                        id="latitude"
                                                        type="number"
                                                        step="any"
                                                        placeholder="10.7769"
                                                        value={latitude ?? ""}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setLatitude(val === "" ? null : parseFloat(val));
                                                        }}
                                                        disabled={true}
                                                        className="bg-gray-100 cursor-not-allowed"
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor="longitude">Kinh độ</Label>
                                                    <Input
                                                        id="longitude"
                                                        type="number"
                                                        step="any"
                                                        placeholder="106.7009"
                                                        value={longitude ?? ""}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setLongitude(val === "" ? null : parseFloat(val));
                                                        }}
                                                        disabled={true}
                                                        className="bg-gray-100 cursor-not-allowed"
                                                    />
                                                </div>
                                            </div>

                                            {/* Charging Posts Management */}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-foreground/90 font-medium">Trụ sạc ({chargingPosts.length})</Label>
                                                    <Button
                                                        type="button"
                                                        onClick={addChargingPost}
                                                        className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white rounded-full"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </Button>
                                                </div>

                                                {chargingPosts.length === 0 && (
                                                    <div className="text-center py-6 text-muted-foreground">
                                                        <Plug className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                        <p className="text-sm">Chưa có trụ sạc nào</p>
                                                        <p className="text-xs">Nhấn nút + để thêm trụ sạc</p>
                                                    </div>
                                                )}

                                                {chargingPosts.length > 0 && (
                                                    <div className="max-h-8 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-800">
                                                        <div className="space-y-2">
                                                            {chargingPosts.map((post, index) => (
                                                                <div key={post.id} className="p-3 border border-gray-600 rounded-lg bg-gray-900/30">
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <h4 className="text-sm font-medium text-white">#{index + 1}</h4>
                                                                        <Button
                                                                            type="button"
                                                                            onClick={() => removeChargingPost(post.id)}
                                                                            className="h-5 w-5 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                                                        >
                                                                            <XCircle className="w-3 h-3" />
                                                                        </Button>
                                                                    </div>

                                                                    <div className="space-y-3">
                                                                        <div>
                                                                            <label className="text-xs text-gray-400 mb-1 block">Loại cổng sạc</label>
                                                                            <select
                                                                                value={post.connectorType}
                                                                                onChange={(e) => {
                                                                                    const selectedType = portTypes.find(type => type.name === e.target.value);
                                                                                    updateChargingPost(post.id, 'connectorType', e.target.value);
                                                                                    if (selectedType) {
                                                                                        updateChargingPost(post.id, 'power', selectedType.power);
                                                                                        updateChargingPost(post.id, 'price', selectedType.price);
                                                                                    }
                                                                                }}
                                                                                className="w-full h-8 text-sm bg-black border border-gray-600 rounded-lg px-3 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-colors"
                                                                            >
                                                                                <option value="">Chọn loại cổng sạc</option>
                                                                                {portTypes.map((type, idx) => (
                                                                                    <option key={idx} value={type.name}>
                                                                                        {type.name} ({type.power} kWh - ₫{type.price}/kWh)
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </div>

                                                                        <div>
                                                                            <label className="text-xs text-gray-400 mb-1 block">Trạng thái</label>
                                                                            <select
                                                                                value={post.status}
                                                                                onChange={(e) => updateChargingPost(post.id, 'status', e.target.value)}
                                                                                className="w-full h-8 text-sm bg-black border border-gray-600 rounded-lg px-3 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-colors"
                                                                            >
                                                                                <option value="AVAILABLE">🟢 Có sẵn</option>
                                                                                <option value="OCCUPIED">🔴 Đang sử dụng</option>
                                                                                <option value="OUT_OF_SERVICE">⚫ Ngừng hoạt động</option>
                                                                                <option value="MAINTENANCE">🔧 Bảo trì</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </ScrollArea>

                                        <div className="pt-4 border-t border-gray-700">
                                            <Button type="submit" disabled={loading} className="w-full">
                                                {loading ? "Đang tạo..." : "Thêm trạm sạc"}
                                            </Button>
                                        </div>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <Card className="bg-black/80 backdrop-blur-xl border border-gray-600 h-[600px]">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center justify-end">
                                        <div className="flex items-center space-x-2">
                                            {/* Thanh tìm kiếm tùy chỉnh với UI đẹp */}
                                            <div className="relative group">
                                                <div className="relative">
                                                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                    <Input
                                                        placeholder="Tìm kiếm địa điểm..."
                                                        value={searchInput}
                                                        onChange={handleSearchInputChange}
                                                        className="pl-10 pr-10 w-80 h-10 bg-background/80 backdrop-blur-sm border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 shadow-sm hover:shadow-md"
                                                        onFocus={() => setShowSearchResults(true)}
                                                    />
                                                    {searchInput && (
                                                        <button
                                                            onClick={() => {
                                                                setSearchInput("");
                                                                setShowSearchResults(false);
                                                                setSearchResults([]);
                                                            }}
                                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Dropdown kết quả tìm kiếm với animation */}
                                                {showSearchResults && (
                                                    <div className="absolute top-full left-0 right-0 mt-3 bg-black border border-gray-600 rounded-2xl shadow-2xl z-50 max-h-96 overflow-hidden animate-in slide-in-from-top-3 duration-300">
                                                        {searchResults.length > 0 ? (
                                                            <>
                                                                {/* Header với gradient đen */}
                                                                <div className="bg-black px-4 py-3 border-b border-gray-700">
                                                                    <div className="flex items-center space-x-2">
                                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center">
                                                                            <MapPin className="w-4 h-4 text-white" />
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-sm font-semibold text-white">
                                                                                {searchResults.length} kết quả tìm thấy
                                                                            </span>
                                                                            <div className="text-xs text-gray-300 mt-0.5">
                                                                                Chọn để xem trên bản đồ
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Results list với scroll */}
                                                                <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                                                                    {searchResults.map((poi, index) => (
                                                                        <div
                                                                            key={poi.id}
                                                                            className="group/item px-4 py-3 hover:bg-gray-900 cursor-pointer border-b border-gray-800 last:border-b-0 transition-all duration-200 hover:shadow-sm"
                                                                            onClick={() => handleSelectPOI(poi)}
                                                                        >
                                                                            <div className="flex items-start space-x-3">
                                                                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center group-hover/item:from-gray-600 group-hover/item:to-gray-500 transition-all duration-200">
                                                                                    <MapPin className="w-5 h-5 text-blue-400" />
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="font-semibold text-sm text-white group-hover/item:text-blue-300 transition-colors line-clamp-1 mb-1">
                                                                                        {poi.name}
                                                                                    </div>
                                                                                    <div className="text-xs text-gray-400 mb-2 line-clamp-1">
                                                                                        📍 {poi.address}
                                                                                    </div>
                                                                                    <div className="flex items-center space-x-2">
                                                                                        <div className="inline-flex items-center px-2 py-1 rounded-md text-xs font-mono text-gray-300 bg-gray-900 border border-gray-700">
                                                                                            <span className="text-gray-500 mr-1">📍</span>
                                                                                            {poi.latitude.toFixed(4)}, {poi.longitude.toFixed(4)}
                                                                                        </div>
                                                                                        <div className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-900/30 text-emerald-300 border border-emerald-700/50">
                                                                                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5"></div>
                                                                                            POI Dataset
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex-shrink-0 opacity-0 group-hover/item:opacity-100 transition-all duration-200 transform group-hover/item:translate-x-1">
                                                                                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                                                                                        <ArrowLeft className="w-4 h-4 text-white rotate-180" />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        ) : searchInput.trim() ? (
                                                            <div className="p-8 text-center">
                                                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-900 flex items-center justify-center">
                                                                    <Search className="w-8 h-8 text-gray-400" />
                                                                </div>
                                                                <div className="text-base font-medium text-white mb-2">
                                                                    Không tìm thấy địa điểm nào
                                                                </div>
                                                                <div className="text-sm text-gray-400">
                                                                    Thử tìm kiếm với từ khóa khác
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <Search
                                                    className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                                                <Input
                                                    placeholder="Tìm kiếm trạm..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="pl-10 w-48"
                                                />
                                            </div>
                                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                                <SelectTrigger className="w-32">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Tất cả</SelectItem>
                                                    <SelectItem value="ACTIVE">Hoạt động</SelectItem>
                                                    <SelectItem value="INACTIVE">Ngoại tuyến</SelectItem>
                                                    <SelectItem value="MAINTENANCE">Bảo trì</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="p-0 h-[520px] relative">
                                    <div ref={mapContainerRef} className="absolute inset-0 w-full h-full rounded-b-lg z-20" />
                                    <div
                                        className="w-full h-full bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950/20 dark:to-green-950/20 rounded-b-lg relative overflow-hidden pointer-events-none z-0">
                                        <div className="absolute inset-0 opacity-20 pointer-events-none">
                                            <svg width="100%" height="100%" className="absolute inset-0">
                                                <defs>
                                                    <pattern id="grid" width="40" height="40"
                                                        patternUnits="userSpaceOnUse">
                                                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor"
                                                            strokeWidth="1" opacity="0.3" />
                                                    </pattern>
                                                </defs>
                                                <rect width="100%" height="100%" fill="url(#grid)" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Thêm CSS cho search control */}
                                    <style dangerouslySetInnerHTML={{
                                        __html: `
                                        .custom-search-control {
                                            position: absolute !important;
                                            top: 10px !important;
                                            left: 10px !important;
                                            z-index: 1000 !important;
                                            background: white !important;
                                            border-radius: 8px !important;
                                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1) !important;
                                            padding: 12px !important;
                                            min-width: 300px !important;
                                            border: 1px solid #e5e7eb !important;
                                        }
                                        
                                        .custom-search-control input {
                                            width: 100% !important;
                                            padding: 10px 12px !important;
                                            border: 1px solid #d1d5db !important;
                                            border-radius: 6px !important;
                                            font-size: 14px !important;
                                            outline: none !important;
                                            background: white !important;
                                            transition: border-color 0.2s !important;
                                        }
                                        
                                        .custom-search-control input:focus {
                                            border-color: #3b82f6 !important;
                                            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                                        }
                                        
                                        .search-results {
                                            position: absolute !important;
                                            top: 100% !important;
                                            left: 0 !important;
                                            right: 0 !important;
                                            background: white !important;
                                            border: 1px solid #d1d5db !important;
                                            border-top: none !important;
                                            border-radius: 0 0 6px 6px !important;
                                            max-height: 250px !important;
                                            overflow-y: auto !important;
                                            display: none !important;
                                            z-index: 1001 !important;
                                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1) !important;
                                        }
                                        
                                        .search-result-item:hover {
                                            background-color: #f9fafb !important;
                                        }
                                        
                                        /* Đảm bảo GeocodingControl hiển thị */
                                        .maplibregl-ctrl-geocoder {
                                            display: block !important;
                                            visibility: visible !important;
                                            opacity: 1 !important;
                                            z-index: 1000 !important;
                                        }
                                        
                                        .maplibregl-ctrl-geocoder input {
                                            width: 300px !important;
                                            padding: 8px 12px !important;
                                            border-radius: 6px !important;
                                            border: 1px solid #d1d5db !important;
                                            font-size: 14px !important;
                                            background: white !important;
                                            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
                                        }
                                        `
                                    }} />

                                    {selectedStationPopup && (
                                        <div
                                            className="absolute top-4 left-4 z-30 bg-black border border-gray-600 rounded-lg p-4 shadow-xl max-w-xs pointer-events-auto">
                                            <div className="flex items-start justify-between mb-2">
                                                <h4 className="font-medium text-sm text-white">{selectedStationPopup.name}</h4>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setSelectedStationPopup(null)}
                                                    className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </Button>
                                            </div>
                                            <p className="text-xs text-gray-300 mb-2">{selectedStationPopup.address}</p>
                                            <div className="flex items-center justify-between mb-2">
                                                {getStatusBadge(selectedStationPopup.status)}
                                                <span className="text-xs text-gray-300">
                                                    {selectedStationPopup.availablePoints}/{selectedStationPopup.totalPoints} điểm sạc
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                {(selectedStationPopup.connectorTypes ?? []).map((connector, idx) => (
                                                    <div key={idx} className="bg-gray-800/50 rounded p-2">
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span className="font-medium text-white">
                                                                {connector.typeName || connector.type}
                                                            </span>
                                                            <Badge variant="outline" className="text-xs h-4 border-gray-600 text-gray-300">
                                                                {connector.powerOutput || connector.power} kW
                                                            </Badge>
                                                        </div>
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span className="text-gray-300">Khả dụng:</span>
                                                            <span
                                                                className={connector.available > 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                                                                {connector.available}/{connector.total}
                                                            </span>
                                                        </div>
                                                        {connector.pricePerKwh && (
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-300">Giá:</span>
                                                                <span className="text-yellow-400 font-medium">
                                                                    {connector.pricePerKwh.toLocaleString()} VND/kWh
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Popup cho POI được chọn */}
                                    {selectedPOI && (
                                        <div className="absolute top-4 right-4 z-30 bg-black border border-gray-600 rounded-lg p-4 shadow-xl max-w-sm pointer-events-auto">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center space-x-2">
                                                    <MapPin className="w-5 h-5 text-blue-400" />
                                                    <h4 className="font-semibold text-white text-sm">{selectedPOI.name}</h4>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setSelectedPOI(null);
                                                        if (tempMarker) {
                                                            tempMarker.remove();
                                                            setTempMarker(null);
                                                        }
                                                    }}
                                                    className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </Button>
                                            </div>

                                            <div className="mb-3">
                                                <div className="text-xs text-gray-400 mb-1">Địa chỉ:</div>
                                                <div className="text-xs text-gray-300 bg-gray-900 border border-gray-700 px-2 py-1 rounded mb-2">
                                                    {selectedPOI.address}
                                                </div>
                                                <div className="text-xs text-gray-400 mb-1">Tọa độ:</div>
                                                <div className="text-xs font-mono text-gray-300 bg-gray-900 border border-gray-700 px-2 py-1 rounded">
                                                    {selectedPOI.latitude.toFixed(4)}, {selectedPOI.longitude.toFixed(4)}
                                                </div>
                                            </div>

                                            {/* Kiểm tra xem đã có trạm sạc ở vị trí này chưa */}
                                            {(() => {
                                                const nearbyStation = stations.find(station => {
                                                    const distance = Math.sqrt(
                                                        Math.pow(station.latitude - selectedPOI.latitude, 2) +
                                                        Math.pow(station.longitude - selectedPOI.longitude, 2)
                                                    );
                                                    return distance < 0.001; // Khoảng 100m
                                                });

                                                if (nearbyStation) {
                                                    return (
                                                        <div className="space-y-2">
                                                            <div className="text-xs text-green-400 font-medium">
                                                                ✓ Đã có trạm sạc gần đây
                                                            </div>
                                                            <div className="bg-gray-900 border border-gray-700 rounded p-2">
                                                                <div className="text-xs text-white font-medium">{nearbyStation.name}</div>
                                                                <div className="text-xs text-gray-400 mt-1">
                                                                    {nearbyStation.availablePoints}/{nearbyStation.totalPoints} điểm sạc
                                                                </div>
                                                                <div className="flex items-center mt-2">
                                                                    {getStatusBadge(nearbyStation.status)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                } else {
                                                    return (
                                                        <div className="space-y-3">
                                                            <div className="text-xs text-yellow-400 font-medium">
                                                                ⚠ Chưa có trạm sạc tại vị trí này
                                                            </div>
                                                            <Button
                                                                onClick={() => {
                                                                    console.log("Setting POI data to form:", {
                                                                        name: selectedPOI.name,
                                                                        address: selectedPOI.address,
                                                                        lat: selectedPOI.latitude,
                                                                        lng: selectedPOI.longitude
                                                                    });
                                                                    setLatitude(selectedPOI.latitude);
                                                                    setLongitude(selectedPOI.longitude);
                                                                    setStationName(selectedPOI.name);
                                                                    setAddress(selectedPOI.address);
                                                                    setIsAddDialogOpen(true);
                                                                    setSelectedPOI(null);
                                                                    if (tempMarker) {
                                                                        tempMarker.remove();
                                                                        setTempMarker(null);
                                                                    }
                                                                }}
                                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 border border-blue-500"
                                                            >
                                                                <Plus className="w-4 h-4 mr-2" />
                                                                Thêm trạm sạc tại đây
                                                            </Button>
                                                        </div>
                                                    );
                                                }
                                            })()}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {selectedStation && (
                                <Card className="mt-4 bg-black/80 backdrop-blur-xl border border-gray-600">
                                    <CardHeader>
                                        <CardTitle>Điều khiển Trạm sạc</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="outline" className="flex items-center space-x-2"
                                                        onClick={handleEditStation}>
                                                        <Edit className="w-4 h-4" />
                                                        <span>Chỉnh sửa</span>
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-4xl max-h-[30vh] overflow-y-auto">
                                                    <DialogHeader>
                                                        <DialogTitle>Chỉnh sửa {selectedStation.name}</DialogTitle>
                                                        <DialogDescription>Cập nhật thông tin và cấu hình cho trạm sạc
                                                            này</DialogDescription>
                                                    </DialogHeader>
                                                    <form
                                                        onSubmit={(e) => handleUpdatingStation(e, selectedStation.id)}>
                                                        <div className="grid gap-4">
                                                            {error && <div
                                                                className="text-red-600 text-sm p-2 bg-red-50 rounded">{error}</div>}
                                                            <div>
                                                                <Label htmlFor="editStationId">Mã trạm sạc</Label>
                                                                <Input
                                                                    id="editStationId"
                                                                    defaultValue={selectedStation.id}
                                                                    disabled
                                                                />
                                                            </div>

                                                            <div>
                                                                <Label htmlFor="editName">Tên trạm sạc</Label>
                                                                <Input
                                                                    id="editName"
                                                                    name="stationName"
                                                                    value={stationName}
                                                                    onChange={(e) => setStationName(e.target.value)}
                                                                    disabled={loading}
                                                                />
                                                            </div>

                                                            <div className="relative">
                                                                <Label htmlFor="editAddress">Địa chỉ</Label>
                                                                <div className="relative">
                                                                    <Input
                                                                        id="editAddress"
                                                                        name="address"
                                                                        value={isAddressFieldTouched ? addressSearchInput : (addressSearchInput || address)}
                                                                        onChange={handleAddressSearchInputChange}
                                                                        onFocus={() => {
                                                                            setShowAddressSearchResults(true);
                                                                            if (!isAddressFieldTouched) {
                                                                                setAddressSearchInput(address);
                                                                                setIsAddressFieldTouched(true);
                                                                            }
                                                                        }}
                                                                        placeholder="Tìm kiếm địa điểm..."
                                                                        disabled={loading}
                                                                        className="w-full"
                                                                    />

                                                                    {/* Address search results dropdown */}
                                                                    {showAddressSearchResults && (
                                                                        <div className="address-search-results-container absolute top-full left-0 right-0 mt-1 bg-black border border-gray-600 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                                                                            <div className="p-3 border-b border-gray-700">
                                                                                <div className="flex items-center space-x-2">
                                                                                    <MapPin className="w-4 h-4 text-blue-400" />
                                                                                    <div>
                                                                                        <span className="text-sm font-semibold text-white">
                                                                                            {addressSearchResults.length} kết quả tìm thấy
                                                                                        </span>
                                                                                        <div className="text-xs text-gray-300 mt-0.5">
                                                                                            Chọn để cập nhật địa chỉ và tọa độ
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                                                                                {addressSearchResults.length > 0 ? (
                                                                                    addressSearchResults.map((poi, index) => (
                                                                                        <div
                                                                                            key={poi.id}
                                                                                            className="group/item px-4 py-3 hover:bg-gray-900 cursor-pointer border-b border-gray-800 last:border-b-0 transition-all duration-200 hover:shadow-sm"
                                                                                            onClick={() => handleSelectAddressPOI(poi)}
                                                                                        >
                                                                                            <div className="flex items-start space-x-3">
                                                                                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center group-hover/item:from-gray-600 group-hover/item:to-gray-500 transition-all duration-200">
                                                                                                    <MapPin className="w-5 h-5 text-blue-400" />
                                                                                                </div>
                                                                                                <div className="flex-1 min-w-0">
                                                                                                    <div className="font-semibold text-sm text-white group-hover/item:text-blue-300 transition-colors line-clamp-1 mb-1">
                                                                                                        {poi.name}
                                                                                                    </div>
                                                                                                    <div className="text-xs text-gray-400 mb-2 line-clamp-1">
                                                                                                        📍 {poi.address}
                                                                                                    </div>
                                                                                                    <div className="flex items-center space-x-2">
                                                                                                        <div className="inline-flex items-center px-2 py-1 rounded-md text-xs font-mono text-gray-300 bg-gray-900 border border-gray-700">
                                                                                                            <span className="text-gray-500 mr-1">📍</span>
                                                                                                            {poi.latitude.toFixed(4)}, {poi.longitude.toFixed(4)}
                                                                                                        </div>
                                                                                                        <div className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-900/30 text-emerald-300 border border-emerald-700/50">
                                                                                                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5"></div>
                                                                                                            POI Dataset
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))
                                                                                ) : addressSearchInput.trim() ? (
                                                                                    <div className="px-4 py-6 text-center text-gray-400">
                                                                                        <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                                                                                        <p className="text-sm">Không tìm thấy địa điểm nào</p>
                                                                                        <p className="text-xs mt-1">Thử từ khóa khác</p>
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <Label htmlFor="editLatitude">Vĩ độ</Label>
                                                                    <Input
                                                                        id="editLatitude"
                                                                        name="latitude"
                                                                        type="number"
                                                                        step="any"
                                                                        value={latitude ?? ""}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setLatitude(val === "" ? null : parseFloat(val));
                                                                        }}
                                                                        disabled={true}
                                                                        className="bg-gray-100 cursor-not-allowed"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <Label htmlFor="editLongitude">Kinh độ</Label>
                                                                    <Input
                                                                        id="editLongitude"
                                                                        name="longitude"
                                                                        type="number"
                                                                        step="any"
                                                                        value={longitude ?? ""}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setLongitude(val === "" ? null : parseFloat(val));
                                                                        }}
                                                                        disabled={true}
                                                                        className="bg-gray-100 cursor-not-allowed"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Charging Points Management for Edit - Editable */}
                                                            <div className="space-y-3">
                                                                <div className="flex items-center justify-between">
                                                                    <Label className="text-foreground/90 font-medium">Trụ sạc ({chargingPosts.length})</Label>
                                                                </div>

                                                                {chargingPosts.length === 0 && (
                                                                    <div className="text-center py-6 text-muted-foreground">
                                                                        <Plug className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                                        <p className="text-sm">Chưa có trụ sạc nào</p>
                                                                    </div>
                                                                )}

                                                                {chargingPosts.length > 0 && (
                                                                    <div className="max-h-8 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-800">
                                                                        <div className="space-y-2 pr-2">
                                                                            {chargingPosts.map((post, index) => (
                                                                                <div key={post.id} className="p-2 border border-gray-600 rounded-lg bg-gray-900/30">
                                                                                    <div className="flex items-center justify-between mb-2">
                                                                                        <h4 className="text-sm font-medium text-white">Trụ sạc #{index + 1}</h4>
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            onClick={() => removeChargingPost(post.id)}
                                                                                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                                                        >
                                                                                            <XCircle className="w-3 h-3" />
                                                                                        </Button>
                                                                                    </div>

                                                                                    <div className="space-y-2">
                                                                                        <div>
                                                                                            <label className="text-xs text-gray-400 mb-1 block">Loại cổng sạc</label>
                                                                                            <select
                                                                                                value={post.connectorType}
                                                                                                onChange={(e) => {
                                                                                                    const selectedType = newPortTypes.find(type => type.name === e.target.value);
                                                                                                    updateChargingPost(post.id, 'connectorType', e.target.value);
                                                                                                    if (selectedType) {
                                                                                                        updateChargingPost(post.id, 'power', selectedType.power.toString());
                                                                                                        updateChargingPost(post.id, 'price', selectedType.price.toString());
                                                                                                    }
                                                                                                }}
                                                                                                className="w-full h-8 text-sm bg-black border border-gray-600 rounded-lg px-3 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-colors"
                                                                                            >
                                                                                                <option value="">Chọn loại cổng sạc</option>
                                                                                                {newPortTypes.map((type, idx) => (
                                                                                                    <option key={idx} value={type.name}>
                                                                                                        {type.name} ({type.power} kWh - ₫{type.price}/kWh)
                                                                                                    </option>
                                                                                                ))}
                                                                                            </select>
                                                                                        </div>

                                                                                        <div>
                                                                                            <label className="text-xs text-gray-400 mb-1 block">Trạng thái</label>
                                                                                            <select
                                                                                                value={post.status}
                                                                                                onChange={(e) => updateChargingPost(post.id, 'status', e.target.value)}
                                                                                                className="w-full h-8 text-sm bg-black border border-gray-600 rounded-lg px-3 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-colors"
                                                                                            >
                                                                                                <option value="AVAILABLE">🟢 Có sẵn</option>
                                                                                                <option value="OCCUPIED">🔴 Đang sử dụng</option>
                                                                                                <option value="OUT_OF_SERVICE">⚫ Ngừng hoạt động</option>
                                                                                                <option value="MAINTENANCE">🔧 Bảo trì</option>
                                                                                            </select>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <Button type="submit" disabled={loading}>
                                                                {loading ? "Đang cập nhật.." : "Cập nhật"}
                                                            </Button>
                                                        </div>
                                                    </form>
                                                </DialogContent>
                                            </Dialog>

                                            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="destructive"
                                                        className="flex items-center space-x-2">
                                                        <Trash2 className="w-4 h-4" />
                                                        <span>Xóa</span>
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent
                                                    className="bg-black border border-gray-600">
                                                    <DialogHeader>
                                                        <DialogTitle>Xác nhận xóa trạm sạc</DialogTitle>
                                                        <DialogDescription>
                                                            Bạn có chắc chắn muốn xóa trạm sạc này? Hành động này không
                                                            thể hoàn tác.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <form onSubmit={(e) => handleDeletingStation(e, selectedStation.id)}>
                                                        {selectedStation && (
                                                            <div className="space-y-4">
                                                                <div>
                                                                    <h4 className="font-medium">{selectedStation.name}</h4>
                                                                    <p className="text-sm text-muted-foreground">Mã
                                                                        trạm: {selectedStation.id}</p>
                                                                    <p className="text-sm text-muted-foreground">{selectedStation.address}</p>
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <span>Trạng thái:</span>
                                                                    {getStatusBadge(selectedStation.status)}
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <span>Điểm sạc:</span>
                                                                    <span className="font-medium">
                                                                        {selectedStation.availablePoints}/{selectedStation.totalPoints}
                                                                    </span>
                                                                </div>
                                                                <Separator />
                                                                <div>
                                                                    <h5 className="font-medium mb-2">Loại Connector:</h5>
                                                                    <div className="space-y-2">
                                                                        {(selectedStation.connectorTypes ?? []).map((connector, idx) => (
                                                                            <div key={idx}
                                                                                className="flex justify-between text-sm">
                                                                                <span>
                                                                                    {connector.typeName || connector.type} ({connector.powerOutput || connector.power} kW)
                                                                                </span>
                                                                                <span
                                                                                    className={connector.available > 0 ? "text-green-600" : "text-red-600"}>
                                                                                    {connector.available}/{connector.total}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <Separator />
                                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                                    <div>
                                                                        <span className="text-muted-foreground">Giờ hoạt động:</span>
                                                                        <p className="font-medium">{selectedStation.operatingHours}</p>
                                                                    </div>
                                                                    <div>
                                                                        <span
                                                                            className="text-muted-foreground">Liên hệ:</span>
                                                                        <p className="font-medium">{selectedStation.contactPhone}</p>
                                                                    </div>
                                                                </div>
                                                                <Separator />
                                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                                    <div>
                                                                        <span className="text-muted-foreground">Doanh thu ngày:</span>
                                                                        <p className="font-medium text-green-600">{Number(selectedStation.revenue.daily || 0).toLocaleString()} VND</p>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-muted-foreground">Doanh thu tháng:</span>
                                                                        <p className="font-medium text-blue-600">{Number(selectedStation.revenue.monthly || 0).toLocaleString()} VND</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-end space-x-2 mt-4">
                                                            <Button variant="outline" type="button"
                                                                onClick={() => setIsDeleteDialogOpen(false)}>
                                                                Hủy
                                                            </Button>
                                                            <Button variant="destructive" type="submit">
                                                                Xác nhận xóa
                                                            </Button>
                                                        </div>
                                                    </form>
                                                </DialogContent>
                                            </Dialog>

                                            {/* Connector Type Deletion Confirmation Dialog */}
                                            <Dialog open={isDeleteConnectorDialogOpen} onOpenChange={setIsDeleteConnectorDialogOpen}>
                                                <DialogContent className="bg-black border border-gray-600">
                                                    <DialogHeader>
                                                        <DialogTitle className="flex items-center space-x-2">
                                                            <Trash2 className="w-5 h-5 text-red-400" />
                                                            <span>Xác nhận xóa loại cổng sạc</span>
                                                        </DialogTitle>
                                                        <DialogDescription>
                                                            Bạn có chắc chắn muốn xóa loại cổng sạc này? Hành động này không thể hoàn tác.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    
                                                    {connectorToDelete && (() => {
                                                        const isInUse = isConnectorTypeInUse(connectorToDelete.id);
                                                        const usageCounts = isInUse ? getConnectorUsageDetails(connectorToDelete.id) : { chargingPoints: 0, carModels: 0 };
                                                        
                                                        return (
                                                            <div className="space-y-4">
                                                                <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                                                    <div className="flex items-center space-x-2 mb-2">
                                                                        <Plug className="w-4 h-4 text-green-400" />
                                                                        <h4 className="font-medium text-white">{connectorToDelete.name}</h4>
                                                                    </div>
                                                                    <p className="text-sm text-gray-400">
                                                                        Loại cổng sạc này sẽ bị xóa vĩnh viễn khỏi hệ thống.
                                                                    </p>
                                                                </div>
                                                                
                                                                {isInUse ? (
                                                                    <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-3">
                                                                        <div className="flex items-start space-x-2">
                                                                            <div className="w-5 h-5 text-red-400 mt-0.5">🚫</div>
                                                                            <div className="text-sm text-red-200">
                                                                                <p className="font-medium mb-1">Không thể xóa:</p>
                                                                                <p className="mb-2">Loại cổng sạc này đang được sử dụng trong hệ thống.</p>
                                                                                <div className="mt-2 space-y-1">
                                                                                    {usageCounts.carModels > 0 && (
                                                                                        <p className="text-xs">• {usageCounts.carModels} mẫu xe đang sử dụng</p>
                                                                                    )}
                                                                                    {usageCounts.chargingPoints > 0 && (
                                                                                        <p className="text-xs">• {usageCounts.chargingPoints} trụ sạc đang sử dụng</p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
                                                                        <div className="flex items-start space-x-2">
                                                                            <div className="w-5 h-5 text-yellow-400 mt-0.5">⚠️</div>
                                                                            <div className="text-sm text-yellow-200">
                                                                                <p className="font-medium mb-1">Lưu ý quan trọng:</p>
                                                                                <p>Đảm bảo rằng không có trụ sạc nào đang sử dụng loại cổng sạc này trước khi xóa.</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    
                                                    <div className="flex justify-end space-x-2 mt-4">
                                                        <Button 
                                                            variant="outline" 
                                                            type="button"
                                                            onClick={() => {
                                                                setIsDeleteConnectorDialogOpen(false);
                                                                setConnectorToDelete(null);
                                                            }}
                                                        >
                                                            Hủy
                                                        </Button>
                                                        <Button 
                                                            variant="destructive" 
                                                            type="button"
                                                            onClick={confirmDeleteConnectorType}
                                                            disabled={connectorToDelete ? isConnectorTypeInUse(connectorToDelete.id) : true}
                                                            className={connectorToDelete && isConnectorTypeInUse(connectorToDelete.id) 
                                                                ? "opacity-50 cursor-not-allowed" 
                                                                : ""
                                                            }
                                                        >
                                                            Xác nhận xóa
                                                        </Button>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>

                                            {/* All Charging Points Dialog */}
                                            <Dialog open={isAllChargingPointsDialogOpen} onOpenChange={setIsAllChargingPointsDialogOpen}>
                                                <DialogContent className="bg-black border border-gray-600 max-w-6xl max-h-[80vh] overflow-hidden">
                                                    <DialogHeader>
                                                        <DialogTitle className="flex items-center space-x-2">
                                                            <Plug className="w-5 h-5 text-primary" />
                                                            <span>Tất cả trụ sạc - {selectedStationForAllPoints?.name}</span>
                                                        </DialogTitle>
                                                        <DialogDescription>
                                                            Danh sách tất cả trụ sạc tại trạm này
                                                        </DialogDescription>
                                                    </DialogHeader>

                                                    {selectedStationForAllPoints && (
                                                        <div className="space-y-4 flex flex-col h-full">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-900/30 rounded-lg">
                                                                <div>
                                                                    <h4 className="font-medium text-white">{selectedStationForAllPoints.name}</h4>
                                                                    <p className="text-sm text-muted-foreground">{selectedStationForAllPoints.address}</p>
                                                                </div>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-sm text-muted-foreground">Tổng số trụ:</span>
                                                                    <span className="font-medium text-white">
                                                                        {allChargingPoints.length}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3 flex-1 overflow-hidden">
                                                                <h5 className="font-medium text-white">Danh sách tất cả trụ sạc</h5>
                                                                {allChargingPoints.length > 0 ? (
                                                                    <ScrollArea className="h-96 w-full">
                                                                        <div className="space-y-2 pr-4">
                                                                            {allChargingPoints.map((point, index) => (
                                                                                <Card key={`${point.chargingPointId}-${index}-${selectedStationForAllPoints?.id}`} className="bg-gray-900/50 border border-gray-600">
                                                                                    <CardContent className="p-4">
                                                                                        <div className="flex items-start justify-between mb-2">
                                                                                            <div className="flex items-center space-x-2">
                                                                                                <Plug className="w-4 h-4 text-primary" />
                                                                                                <h6 className="font-medium text-white">Trụ #{point.chargingPointId}</h6>
                                                                                            </div>
                                                                                            <div className="flex items-center space-x-2">
                                                                                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${point.status === 'AVAILABLE' ? 'bg-green-600/20 text-green-400' :
                                                                                                        point.status === 'OCCUPIED' ? 'bg-red-600/20 text-red-400' :
                                                                                                            point.status === 'OUT_OF_SERVICE' ? 'bg-gray-600/20 text-gray-400' :
                                                                                                                'bg-yellow-600/20 text-yellow-400'
                                                                                                    }`}>
                                                                                                    {point.status === 'AVAILABLE' ? '🟢 Có sẵn' :
                                                                                                        point.status === 'OCCUPIED' ? '🔴 Đang sử dụng' :
                                                                                                            point.status === 'OUT_OF_SERVICE' ? '⚫ Ngừng hoạt động' :
                                                                                                                '🔧 Bảo trì'}
                                                                                                </div>
                                                                                                <Button
                                                                                                    size="sm"
                                                                                                    variant="outline"
                                                                                                    onClick={() => {
                                                                                                        // TODO: Add delete functionality
                                                                                                        console.log("Delete charging point:", point.chargingPointId);
                                                                                                    }}
                                                                                                    className="h-6 px-2 text-red-400 border-red-400 hover:bg-red-400/10"
                                                                                                >
                                                                                                    <Trash2 className="w-3 h-3" />
                                                                                                </Button>
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                                                                            <div>
                                                                                                <span className="text-muted-foreground">Trạng thái:</span>
                                                                                                <p className="font-medium text-white">{point.status || "Unknown"}</p>
                                                                                            </div>
                                                                                            <div>
                                                                                                <span className="text-muted-foreground">Loại:</span>
                                                                                                <p className="font-medium text-white">{point.typeName || "Unknown"}</p>
                                                                                            </div>
                                                                                            <div>
                                                                                                <span className="text-muted-foreground">Công suất:</span>
                                                                                                <p className="font-medium text-white">{point.powerOutput || 0} kW</p>
                                                                                            </div>
                                                                                            <div>
                                                                                                <span className="text-muted-foreground">Giá:</span>
                                                                                                <p className="font-medium text-white">₫{(point.pricePerKwh || 0).toLocaleString()}/kWh</p>
                                                                                            </div>
                                                                                            <div>
                                                                                                <span className="text-muted-foreground">ID:</span>
                                                                                                <p className="font-medium text-white">#{point.chargingPointId}</p>
                                                                                            </div>
                                                                                            <div>
                                                                                                <span className="text-muted-foreground">Trạm:</span>
                                                                                                <p className="font-medium text-white">{selectedStationForAllPoints?.name || "Unknown Station"}</p>
                                                                                            </div>
                                                                                        </div>
                                                                                    </CardContent>
                                                                                </Card>
                                                                            ))}
                                                                        </div>
                                                                    </ScrollArea>
                                                                ) : (
                                                                    <div className="text-center py-8 text-muted-foreground">
                                                                        <Plug className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                                                        <p className="text-lg font-medium">Chưa có trụ sạc nào</p>
                                                                        <p className="text-sm">Trạm này chưa được cấu hình trụ sạc</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex justify-end pt-4 border-t border-gray-600">
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => setIsAllChargingPointsDialogOpen(false)}
                                                            className="bg-gray-800 hover:bg-gray-700 text-white border-gray-600"
                                                        >
                                                            Đóng
                                                        </Button>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>

                                        </div>

                                        <Separator className="my-4" />
                                        <div>
                                            <h4 className="font-medium mb-3 flex items-center">
                                                <Activity className="w-4 h-4 mr-2 text-primary" />
                                                Charger Post Activating
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <form onSubmit={(e) => {
                                                    e.preventDefault();
                                                    handleChargerActivate(selectedStation.id);
                                                }} className="w-full">
                                                    <Button
                                                        type="submit"
                                                        variant={selectedStation.status === "ACTIVE" ? "outline" : "default"}
                                                        className="w-full flex items-center justify-center space-x-2"
                                                        disabled={selectedStation.status === "ACTIVE"}
                                                    >
                                                        <Power className="w-4 h-4" />
                                                        <span>Kích hoạt</span>
                                                    </Button>
                                                </form>

                                                <form onSubmit={(e) => {
                                                    e.preventDefault();
                                                    handleChargerDeactivate(selectedStation.id);
                                                }} className="w-full">
                                                    <Button
                                                        type="submit"
                                                        variant={selectedStation.status === "INACTIVE" ? "outline" : "secondary"}
                                                        className="w-full flex items-center justify-center space-x-2"
                                                        disabled={selectedStation.status === "INACTIVE"}
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                        <span>Vô hiệu hóa</span>
                                                    </Button>
                                                </form>

                                                <Button variant="outline"
                                                    onClick={() => handleChargerRestart(selectedStation.id)}
                                                    className="flex items-center space-x-2">
                                                    <RotateCw className="w-4 h-4" />
                                                    <span>Khởi động lại</span>
                                                </Button>
                                            </div>

                                            <div className="mt-3 p-3 bg-muted/30 rounded-lg">
                                                <div className="text-xs text-muted-foreground mb-2">Trạng thái hiện
                                                    tại:
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    {getStatusBadge(selectedStation.status)}
                                                    <span
                                                        className="text-xs text-muted-foreground">Cập nhật: {new Date().toLocaleString("vi-VN")}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        <div className="space-y-4">
                            <Card className="bg-black/80 backdrop-blur-xl border border-gray-600">
                                <CardHeader>
                                    <CardTitle>Danh sách Trạm sạc</CardTitle>
                                    <p className="text-sm text-muted-foreground">{filteredStations.length} trạm sạc</p>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <ScrollArea className="h-[500px]">
                                        <div className="space-y-2 p-4">
                                            {filteredStations.map((station) => (
                                                <Card
                                                    key={station.id}
                                                    className={`cursor-pointer transition-all hover:shadow-md ${selectedStation?.id === station.id ? "border-primary bg-primary/5" : "border-border/50"
                                                        }`}
                                                    onClick={() => handleStationClick(station)}
                                                >
                                                    <CardContent className="p-4">
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex items-center space-x-2">
                                                                {getStatusIcon(station.status)}
                                                                <h4 className="font-medium text-sm">{station.name}</h4>
                                                            </div>
                                                            {getStatusBadge(station.status)}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mb-1">Mã
                                                            trạm: {station.id}</p>
                                                        <p className="text-xs text-muted-foreground mb-3">{station.address}</p>

                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div className="flex items-center space-x-1">
                                                                <Plug className="w-3 h-3 text-primary" />
                                                                <span>
                                                                    {station.availablePoints}/{station.totalPoints}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center space-x-1">
                                                                <Zap className="w-3 h-3 text-yellow-500" />
                                                                <span>{(station.connectorTypes ?? []).length} loại</span>
                                                            </div>
                                                        </div>

                                                        <Separator className="my-2" />

                                                        <div className="space-y-1">
                                                            {(station.connectorTypes ?? []).map((connector, idx) => (
                                                                <div key={idx} className="flex justify-between text-xs">
                                                                    <span
                                                                        className="text-muted-foreground">
                                                                        {connector.typeName || connector.type} ({connector.powerOutput || connector.power} kW):
                                                                    </span>
                                                                    <span
                                                                        className={connector.available > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                                                        {connector.available}/{connector.total}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div className="mt-3 pt-2 border-t border-gray-600">
                                                            <Button
                                                                type="button"
                                                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                                                    e.stopPropagation();
                                                                    handleViewAllChargingPoints(station);
                                                                }}
                                                                className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                                                            >
                                                                <Plug className="w-3 h-3 mr-1" />
                                                                Hiển thị trụ sạc
                                                            </Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>

                        </div>
                    </div>
                </div>
            </div>
            <Toaster />
        </>
    );
}