package swp391.code.swp391.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import swp391.code.swp391.entity.PriceFactor;

import java.util.List;

@Repository
public interface PriceFactorRepository extends JpaRepository<PriceFactor, Long> {

    /**
     * Tìm các hệ số giá theo station ID
     */
    List<PriceFactor> findByStationStationId(Long stationId);
}