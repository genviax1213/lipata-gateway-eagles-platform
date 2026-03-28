import 'package:flutter/material.dart';

import '../core/auth_store.dart';
import '../repositories/auth_repository.dart';
import 'announcements_screen.dart';
import 'my_contributions_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final AuthRepository _authRepository = AuthRepository();
  int _selectedIndex = 0;

  Future<void> _logout() async {
    final token = widget.authStore.session?.token;
    if (token != null && token.isNotEmpty) {
      await _authRepository.logout(token);
    }
    await widget.authStore.clear();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.authStore.session;
    final pages = <Widget>[
      _HomeSectionShell(
        title: 'My Contributions',
        subtitle: 'Your mobile access is limited to your personal contribution records and announcements.',
        availableModules: const <String>['My Contributions', 'Announcements'],
        child: MyContributionsScreen(authStore: widget.authStore),
      ),
      AnnouncementsScreen(authStore: widget.authStore),
    ];
    final destinations = <NavigationDestination>[
      const NavigationDestination(
        icon: Icon(Icons.payments_outlined),
        selectedIcon: Icon(Icons.payments),
        label: 'My Contributions',
      ),
      const NavigationDestination(
        icon: Icon(Icons.campaign_outlined),
        selectedIcon: Icon(Icons.campaign),
        label: 'Announcements',
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('LGEC Mobile'),
        actions: <Widget>[
          if (session != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Center(
                child: Text(
                  session.email,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
          IconButton(
            tooltip: 'Logout',
            onPressed: _logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(child: pages[_selectedIndex.clamp(0, pages.length - 1)]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex.clamp(0, destinations.length - 1),
        onDestinationSelected: (int value) {
          setState(() {
            _selectedIndex = value;
          });
        },
        destinations: destinations,
      ),
    );
  }
}

class _HomeSectionShell extends StatelessWidget {
  const _HomeSectionShell({
    required this.title,
    required this.subtitle,
    required this.availableModules,
    required this.child,
  });

  final String title;
  final String subtitle;
  final List<String> availableModules;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0x33FFFFFF)),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: <Color>[
                Color(0x261B8CFF),
                Color(0x1444C2FF),
              ],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFFD6E4F6),
                      height: 1.45,
                    ),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: availableModules
                    .map(
                      (String module) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: const Color(0x1FFFFFFF),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: const Color(0x26FFFFFF)),
                        ),
                        child: Text(
                          module,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                      ),
                    )
                    .toList(growable: false),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: MediaQuery.of(context).size.height * 0.62,
          child: child,
        ),
      ],
    );
  }
}
