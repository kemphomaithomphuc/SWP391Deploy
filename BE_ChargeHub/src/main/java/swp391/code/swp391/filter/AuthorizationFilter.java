package swp391.code.swp391.filter;

import com.nimbusds.jose.JOSEException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import swp391.code.swp391.entity.User;
import swp391.code.swp391.repository.UserRepository;
import swp391.code.swp391.service.JwtService;

import java.io.IOException;
import java.text.ParseException;
import java.util.Arrays;

@Component
@RequiredArgsConstructor
public class AuthorizationFilter extends OncePerRequestFilter {

    public final JwtService jwtService;
    public final UserRepository userRepository;

    private static final String[] EXCLUDED_PATHS = {
            "/api/auth/**",
            "/api/otp/send/forgot-password",
            "/api/otp/verify/forgot-password",
            "/api/otp/reset-password",
    };

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        AntPathMatcher pathMatcher = new AntPathMatcher();
        String path = request.getRequestURI();
        return Arrays.stream(EXCLUDED_PATHS).anyMatch(pattern -> pathMatcher.match(pattern, path));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\": \"No authentication found\"}");
            return;
        }
        String userIdentifier = auth.getName();
        User user;
        if (userIdentifier.matches("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")){
            user = userRepository.getUserByEmail(userIdentifier);
        } else {
            user = userRepository.getUserByPhone(userIdentifier);
        }

        if (user == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\": \"User not found\"}");
            return;
        }

        if (user.getStatus().name().equals("BANNED") || user.getViolations()>=3) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\": \"User is banned\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }
}