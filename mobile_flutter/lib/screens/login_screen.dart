import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/auth_store.dart';
import '../repositories/auth_repository.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _emailFocusNode = FocusNode();
  final _passwordFocusNode = FocusNode();
  final _repository = AuthRepository();

  bool _submitting = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _emailFocusNode.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _error = null;
      _notice = null;
    });

    try {
      final session = await _repository.login(
        email: _emailController.text,
        password: _passwordController.text,
      );
      await widget.authStore.save(session);
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  Future<void> _forgotPassword() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      setState(() {
        _error = 'Enter your assigned login email first.';
        _notice = null;
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _notice = null;
    });

    try {
      await _repository.forgotPassword(email);
      if (!mounted) return;
      setState(() {
        _notice = 'If the account is eligible, recovery instructions were sent to the linked member email.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _notice = null;
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  void _focusEmailField() {
    FocusScope.of(context).requestFocus(_emailFocusNode);
    SystemChannels.textInput.invokeMethod<void>('TextInput.show');
  }

  void _focusPasswordField() {
    FocusScope.of(context).requestFocus(_passwordFocusNode);
    SystemChannels.textInput.invokeMethod<void>('TextInput.show');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[
              Color(0xFF03101E),
              Color(0xFF0A1730),
              Color(0xFF133964),
            ],
          ),
        ),
        child: Stack(
          children: <Widget>[
            const Positioned(
              top: -80,
              left: -40,
              child: _GlowOrb(
                size: 220,
                colors: <Color>[Color(0x993EA6FF), Color(0x003EA6FF)],
              ),
            ),
            const Positioned(
              top: 180,
              right: -60,
              child: _GlowOrb(
                size: 260,
                colors: <Color>[Color(0x66A7D4FF), Color(0x00A7D4FF)],
              ),
            ),
            const Positioned(
              bottom: -40,
              left: 30,
              child: _GlowOrb(
                size: 240,
                colors: <Color>[Color(0x66E2B55F), Color(0x00E2B55F)],
              ),
            ),
            SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 460),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(32),
                        border: Border.all(color: const Color(0x33FFFFFF)),
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: <Color>[
                            Color(0x30FFFFFF),
                            Color(0x18FFFFFF),
                          ],
                        ),
                        boxShadow: const <BoxShadow>[
                          BoxShadow(
                            color: Color(0x55030C18),
                            blurRadius: 40,
                            offset: Offset(0, 24),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: <Widget>[
                              Center(
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: <Widget>[
                                    Image.asset(
                                      'assets/images/lgec-logo.png',
                                      width: 74,
                                      height: 74,
                                      fit: BoxFit.contain,
                                    ),
                                    const SizedBox(width: 14),
                                    Container(
                                      width: 1,
                                      height: 46,
                                      color: const Color(0x33FFFFFF),
                                    ),
                                    const SizedBox(width: 14),
                                    Image.asset(
                                      'assets/images/tfoe-logo.png',
                                      width: 70,
                                      height: 70,
                                      fit: BoxFit.contain,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 24),
                              const Text(
                                'Portal Login',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 30,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.2,
                                  color: Color(0xFFF3C56A),
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Internal finance and announcements access for authorized LGEC accounts.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 14,
                                  height: 1.45,
                                  color: Color(0xFFD6E4F6),
                                ),
                              ),
                              const SizedBox(height: 24),
                              TextFormField(
                                controller: _emailController,
                                focusNode: _emailFocusNode,
                                keyboardType: TextInputType.text,
                                textInputAction: TextInputAction.next,
                                autocorrect: false,
                                enableSuggestions: false,
                                smartDashesType: SmartDashesType.disabled,
                                smartQuotesType: SmartQuotesType.disabled,
                                onTapAlwaysCalled: true,
                                style: const TextStyle(color: Colors.white),
                                decoration: const InputDecoration(
                                  hintText: 'firstname.lastname@lgec.org',
                                ),
                                onTap: _focusEmailField,
                                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                                onFieldSubmitted: (_) => _focusPasswordField(),
                                validator: (value) {
                                  final v = (value ?? '').trim();
                                  if (v.isEmpty) return 'Email is required';
                                  if (!v.contains('@')) return 'Enter a valid email';
                                  return null;
                                },
                              ),
                              const SizedBox(height: 14),
                              TextFormField(
                                controller: _passwordController,
                                focusNode: _passwordFocusNode,
                                obscureText: true,
                                onTapAlwaysCalled: true,
                                textInputAction: TextInputAction.done,
                                autofillHints: const <String>[AutofillHints.password],
                                style: const TextStyle(color: Colors.white),
                                decoration: const InputDecoration(
                                  hintText: 'Enter your password',
                                ),
                                onTap: _focusPasswordField,
                                onTapOutside: (_) => FocusScope.of(context).unfocus(),
                                onFieldSubmitted: (_) {
                                  if (!_submitting) {
                                    _submit();
                                  }
                                },
                                validator: (value) {
                                  if ((value ?? '').isEmpty) return 'Password is required';
                                  return null;
                                },
                              ),
                              const SizedBox(height: 16),
                              if (_error != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: Text(
                                    _error!,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Color(0xFFFF8F8F),
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              if (_notice != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: Text(
                                    _notice!,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Color(0xFFF3C56A),
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      height: 1.4,
                                    ),
                                  ),
                                ),
                              DecoratedBox(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(18),
                                  gradient: const LinearGradient(
                                    colors: <Color>[Color(0xFF5DB2FF), Color(0xFF2A7BFF)],
                                  ),
                                  boxShadow: const <BoxShadow>[
                                    BoxShadow(
                                      color: Color(0x663A8BFF),
                                      blurRadius: 20,
                                      offset: Offset(0, 14),
                                    ),
                                  ],
                                ),
                                child: FilledButton(
                                style: FilledButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  shadowColor: Colors.transparent,
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size.fromHeight(50),
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                    textStyle: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.2,
                                    ),
                                  ),
                                  onPressed: _submitting ? null : _submit,
                                  child: _submitting
                                      ? const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.2,
                                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                          ),
                                        )
                                      : const Text('Login'),
                                ),
                              ),
                              const SizedBox(height: 10),
                              SizedBox(
                                height: 42,
                                child: TextButton(
                                  style: TextButton.styleFrom(
                                    foregroundColor: const Color(0xFFF3C56A),
                                    textStyle: const TextStyle(fontWeight: FontWeight.w700),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                  ),
                                  onPressed: _submitting ? null : _forgotPassword,
                                  child: const Text('Forgot Password?'),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Recovery is sent to the linked member email, not the login alias.',
                                textAlign: TextAlign.center,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: const Color(0xA8D6E4F6),
                                  height: 1.4,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GlowOrb extends StatelessWidget {
  const _GlowOrb({
    required this.size,
    required this.colors,
  });

  final double size;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: colors),
        ),
      ),
    );
  }
}
