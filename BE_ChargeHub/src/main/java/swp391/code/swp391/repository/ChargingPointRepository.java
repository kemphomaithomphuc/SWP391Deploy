package swp391.code.swp391.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import swp391.code.swp391.entity.ChargingPoint;
import swp391.code.swp391.entity.ChargingPoint.ChargingPointStatus;

import java.util.List;

@Repository
public interface ChargingPointRepository extends JpaRepository<ChargingPoint, Long> {

    // Tìm charging points theo station ID
    List<ChargingPoint> findByStationStationId(Long stationId);

    // Tìm charging points theo status
    List<ChargingPoint> findByStatus(ChargingPointStatus status);

    // Tìm charging points theo station ID và status
    List<ChargingPoint> findByStationStationIdAndStatus(Long stationId, ChargingPointStatus status);

    // Kiểm tra charging point ID đã tồn tại
    boolean existsByChargingPointId(Long chargingPointId);

    // Đếm số lượng charging points theo status
    long countByStatus(ChargingPointStatus status);

    // Đếm số lượng charging points theo station
    long countByStationStationId(Long stationId);

//    // Custom query: Lấy available charging points có connector types
//    @Query("SELECT cp FROM ChargingPoint cp WHERE cp.status = 'AVAILABLE' AND SIZE(cp.connectorTypes) > 0")
//    List<ChargingPoint> findAvailableChargingPointsWithConnectors();
//
//    // Custom query: Tìm charging points theo connector type
//    @Query("SELECT DISTINCT cp FROM ChargingPoint cp JOIN cp.connectorTypes ct WHERE ct.connectorTypeId = :connectorTypeId")
//    List<ChargingPoint> findByConnectorTypeId(@Param("connectorTypeId") Long connectorTypeId);
//
//    // Custom query: Tìm charging points không có connector types
//    @Query("SELECT cp FROM ChargingPoint cp WHERE SIZE(cp.connectorTypes) = 0")
//    List<ChargingPoint> findChargingPointsWithoutConnectors();
//
//    // Custom query: Lấy charging points với số lượng connector types
//    @Query("SELECT cp, SIZE(cp.connectorType) FROM ChargingPoint cp")
//    List<Object[]> findChargingPointsWithConnectorCount();

    @Query("SELECT cp FROM ChargingPoint cp WHERE cp.status = 'AVAILABLE' AND cp.connectorType IS NOT NULL")
    List<ChargingPoint> findAvailableChargingPointsWithConnectors();

    @Query("SELECT cp FROM ChargingPoint cp WHERE cp.connectorType.connectorTypeId = :connectorTypeId")
    List<ChargingPoint> findByConnectorTypeId(@Param("connectorTypeId") Long connectorTypeId);

    @Query("SELECT cp FROM ChargingPoint cp WHERE cp.connectorType IS NULL")
    List<ChargingPoint> findChargingPointsWithoutConnectors();

    @Query("SELECT cp.connectorType.typeName, COUNT(cp) FROM ChargingPoint cp WHERE cp.connectorType IS NOT NULL GROUP BY cp.connectorType.typeName")
    List<Object[]> countChargingPointsGroupedByConnectorType(); // Optional: thống kê

    /**
     * Tìm charging points theo station, connector type và status
     * Dùng để tìm trụ sạc thay thế
     */
    List<ChargingPoint> findByStation_StationIdAndConnectorType_ConnectorTypeIdAndStatus(
            Long stationId,
            Long connectorTypeId,
            ChargingPointStatus status
    );
}