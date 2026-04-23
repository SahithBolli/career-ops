package io.careerops.service;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class JobLevelClassifier {

    public enum Level {
        ENTRY, MID, SENIOR, LEAD, MANAGER, DIRECTOR, VP, EXECUTIVE, UNKNOWN
    }

    private static final Map<Level, List<String>> LEVEL_SIGNALS = Map.of(
        Level.ENTRY,    List.of("junior", "associate", "entry level", "entry-level", "new grad", "graduate"),
        Level.MID,      List.of("mid-level", "mid level", "software engineer ii", "swe ii"),
        Level.SENIOR,   List.of("senior", "sr.", "sr software", "senior software", "senior java", "senior engineer"),
        Level.LEAD,     List.of("tech lead", "technical lead", "engineering lead", "lead engineer", "lead developer", "lead software"),
        Level.MANAGER,  List.of("engineering manager", "software manager", "dev manager", "team lead manager"),
        Level.DIRECTOR, List.of("director of engineering", "director of software", "engineering director"),
        Level.VP,       List.of("vp of engineering", "vice president", "vp engineering"),
        Level.EXECUTIVE,List.of("chief", "cto", "ceo", "cpo", "head of engineering", "head of software")
    );

    // Levels that are allowed (user wants entry/mid/senior only)
    private static final List<Level> ALLOWED_LEVELS = List.of(Level.ENTRY, Level.MID, Level.SENIOR, Level.UNKNOWN);

    public Level classify(String title) {
        if (title == null) return Level.UNKNOWN;
        String lower = title.toLowerCase();

        for (var entry : LEVEL_SIGNALS.entrySet()) {
            if (entry.getValue().stream().anyMatch(lower::contains)) {
                return entry.getKey();
            }
        }
        return Level.UNKNOWN;
    }

    public boolean isAllowed(String title) {
        return ALLOWED_LEVELS.contains(classify(title));
    }

    public String getLevelLabel(String title) {
        return classify(title).name();
    }

    public String getExclusionReason(String title) {
        Level level = classify(title);
        return switch (level) {
            case LEAD     -> "Role is a Lead position — above target level (Entry/Mid/Senior only)";
            case MANAGER  -> "Role is a Manager position — above target level";
            case DIRECTOR -> "Role is a Director position — above target level";
            case VP       -> "Role is a VP position — above target level";
            case EXECUTIVE-> "Role is Executive/C-level — above target level";
            default       -> null;
        };
    }
}
